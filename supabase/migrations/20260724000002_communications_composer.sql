alter table public.communication_campaigns
  add column if not exists preview_text text,
  add column if not exists body_html text,
  add column if not exists body_text text,
  add column if not exists recipient_filters jsonb not null default '[]'::jsonb,
  add column if not exists from_name text,
  add column if not exists reply_to_email text;

update public.communication_campaigns
set
  body_text = coalesce(body_text, body),
  body_html = coalesce(body_html, body),
  from_name = coalesce(from_name, 'BLW Canada'),
  reply_to_email = coalesce(reply_to_email, '')
where body_text is null
   or body_html is null
   or from_name is null
   or reply_to_email is null;

create table if not exists public.communication_contacts (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  email        text not null,
  notes        text,
  source       text not null default 'manual'
               check (source in ('manual', 'imported')),
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists communication_contacts_email_lower_key
  on public.communication_contacts (lower(email));

create table if not exists public.communication_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  color        text not null default '#4C2A92',
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists communication_categories_name_lower_key
  on public.communication_categories (lower(name));

create table if not exists public.communication_contact_categories (
  contact_id   uuid not null references public.communication_contacts(id) on delete cascade,
  category_id  uuid not null references public.communication_categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (contact_id, category_id)
);

alter table public.communication_contacts enable row level security;
alter table public.communication_categories enable row level security;
alter table public.communication_contact_categories enable row level security;

drop policy if exists "comm_contacts_select" on public.communication_contacts;
drop policy if exists "comm_contacts_insert" on public.communication_contacts;
drop policy if exists "comm_contacts_update" on public.communication_contacts;
drop policy if exists "comm_contacts_delete" on public.communication_contacts;
create policy "comm_contacts_select"
  on public.communication_contacts for select to authenticated using (true);
create policy "comm_contacts_insert"
  on public.communication_contacts for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));
create policy "comm_contacts_update"
  on public.communication_contacts for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));
create policy "comm_contacts_delete"
  on public.communication_contacts for delete to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));

drop policy if exists "comm_categories_select" on public.communication_categories;
drop policy if exists "comm_categories_insert" on public.communication_categories;
drop policy if exists "comm_categories_update" on public.communication_categories;
drop policy if exists "comm_categories_delete" on public.communication_categories;
create policy "comm_categories_select"
  on public.communication_categories for select to authenticated using (true);
create policy "comm_categories_insert"
  on public.communication_categories for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));
create policy "comm_categories_update"
  on public.communication_categories for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));
create policy "comm_categories_delete"
  on public.communication_categories for delete to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));

drop policy if exists "comm_contact_categories_select" on public.communication_contact_categories;
drop policy if exists "comm_contact_categories_insert" on public.communication_contact_categories;
drop policy if exists "comm_contact_categories_delete" on public.communication_contact_categories;
create policy "comm_contact_categories_select"
  on public.communication_contact_categories for select to authenticated using (true);
create policy "comm_contact_categories_insert"
  on public.communication_contact_categories for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));
create policy "comm_contact_categories_delete"
  on public.communication_contact_categories for delete to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));

drop trigger if exists trg_comm_contacts_updated_at on public.communication_contacts;
create trigger trg_comm_contacts_updated_at
  before update on public.communication_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_comm_categories_updated_at on public.communication_categories;
create trigger trg_comm_categories_updated_at
  before update on public.communication_categories
  for each row execute function public.set_updated_at();

create or replace function public.fire_scheduled_campaigns()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign record;
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
begin
  if v_url is null or v_key is null then
    raise log 'fire_scheduled_campaigns: app_settings not configured; skipping';
    return;
  end if;

  for campaign in
    select id
    from public.communication_campaigns
    where status = 'scheduled'
      and scheduled_at <= now()
      and scheduled_at > now() - interval '1 hour'
  loop
    update public.communication_campaigns
    set status = 'sending', updated_at = now()
    where id = campaign.id;

    perform http_post(
      url          := v_url || '/functions/v1/send-communication-email',
      body         := json_build_object('campaign_id', campaign.id)::text,
      content_type := 'application/json',
      headers      := array[
        http_header('Authorization', 'Bearer ' || v_key)
      ]
    );
  end loop;
end;
$$;

create or replace function public.check_and_fire_campaigns_manually()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  fired_count integer := 0;
  campaign    record;
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
begin
  if v_url is null or v_key is null then
    return json_build_object('fired', 0, 'error', 'app_settings not configured');
  end if;

  for campaign in
    select id
    from public.communication_campaigns
    where status = 'scheduled'
      and scheduled_at <= now()
      and scheduled_at > now() - interval '1 hour'
  loop
    update public.communication_campaigns
    set status = 'sending', updated_at = now()
    where id = campaign.id;

    perform http_post(
      url          := v_url || '/functions/v1/send-communication-email',
      body         := json_build_object('campaign_id', campaign.id)::text,
      content_type := 'application/json',
      headers      := array[
        http_header('Authorization', 'Bearer ' || v_key)
      ]
    );

    fired_count := fired_count + 1;
  end loop;

  return json_build_object('fired', fired_count);
end;
$$;
