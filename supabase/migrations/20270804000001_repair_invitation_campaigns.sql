-- ============================================================================
-- Repair migration: invitation_campaigns + invitation_recipients may be absent
-- from the live DB (20270106000000/00001 were recorded as applied but the
-- schema cache error proves the tables never landed). Re-runs everything with
-- IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE so it is safe to push
-- whether or not the objects already exist. Ends with NOTIFY pgrst to force
-- PostgREST to reload its schema cache immediately.
-- ============================================================================

-- ── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.invitation_campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid,

  title text not null,
  description text,
  content jsonb not null default '{}',

  subject_line text not null default 'You''re invited!',
  preview_text text,
  html_content text,
  theme_config jsonb not null default '{}',
  template_variables jsonb not null default '{}',

  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'archived')),
  scheduled_at timestamptz,
  sent_at timestamptz,

  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  recipient_count int not null default 0,
  sent_count int not null default 0,
  rsvp_yes int not null default 0,
  rsvp_no int not null default 0,
  rsvp_maybe int not null default 0,

  reminder_3d_sent boolean not null default false,
  reminder_1d_sent boolean not null default false
);

create table if not exists public.invitation_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.invitation_campaigns(id) on delete cascade,

  recipient_email text not null,
  recipient_name text,
  recipient_user_id uuid references public.users(id) on delete set null,

  custom_fields jsonb not null default '{}',

  rsvp_token text not null unique,
  rsvp_response text not null default 'pending'
    check (rsvp_response in ('pending', 'yes', 'no', 'maybe')),
  rsvp_at timestamptz,
  rsvp_notes text check (char_length(rsvp_notes) <= 500),

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'bounced', 'complained')),
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_campaign_email unique (campaign_id, recipient_email)
);

-- ── Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_invitation_recipients_rsvp_token
  on public.invitation_recipients(rsvp_token);
create index if not exists idx_invitation_recipients_campaign_response
  on public.invitation_recipients(campaign_id, rsvp_response);
create index if not exists idx_invitation_recipients_user_id
  on public.invitation_recipients(recipient_user_id);
create index if not exists idx_invitation_campaigns_status
  on public.invitation_campaigns(status);
create index if not exists idx_invitation_campaigns_created_by
  on public.invitation_campaigns(created_by);

-- ── updated_at triggers ───────────────────────────────────────────────────

drop trigger if exists trg_invitation_campaigns_updated_at on public.invitation_campaigns;
create trigger trg_invitation_campaigns_updated_at
  before update on public.invitation_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists trg_invitation_recipients_updated_at on public.invitation_recipients;
create trigger trg_invitation_recipients_updated_at
  before update on public.invitation_recipients
  for each row execute function public.set_updated_at();

-- ── Denormalized RSVP counts trigger ─────────────────────────────────────

create or replace function public.update_campaign_rsvp_counts()
returns trigger
language plpgsql
as $$
declare
  v_yes int;
  v_no  int;
  v_maybe int;
begin
  select
    count(*) filter (where rsvp_response = 'yes'),
    count(*) filter (where rsvp_response = 'no'),
    count(*) filter (where rsvp_response = 'maybe')
  into v_yes, v_no, v_maybe
  from public.invitation_recipients
  where campaign_id = new.campaign_id;

  update public.invitation_campaigns
  set rsvp_yes = v_yes, rsvp_no = v_no, rsvp_maybe = v_maybe
  where id = new.campaign_id;

  return new;
end;
$$;

drop trigger if exists trg_update_rsvp_counts on public.invitation_recipients;
create trigger trg_update_rsvp_counts
  after insert or update on public.invitation_recipients
  for each row execute function public.update_campaign_rsvp_counts();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.invitation_campaigns enable row level security;
alter table public.invitation_recipients enable row level security;

drop policy if exists "invitation_campaigns_select" on public.invitation_campaigns;
create policy "invitation_campaigns_select" on public.invitation_campaigns
  for select to authenticated using (true);

drop policy if exists "invitation_campaigns_insert" on public.invitation_campaigns;
create policy "invitation_campaigns_insert" on public.invitation_campaigns
  for insert to authenticated
  with check (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

drop policy if exists "invitation_campaigns_update" on public.invitation_campaigns;
create policy "invitation_campaigns_update" on public.invitation_campaigns
  for update to authenticated
  using (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

drop policy if exists "invitation_campaigns_delete" on public.invitation_campaigns;
create policy "invitation_campaigns_delete" on public.invitation_campaigns
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

drop policy if exists "invitation_recipients_select" on public.invitation_recipients;
create policy "invitation_recipients_select" on public.invitation_recipients
  for select to authenticated using (true);

drop policy if exists "invitation_recipients_insert" on public.invitation_recipients;
create policy "invitation_recipients_insert" on public.invitation_recipients
  for insert to authenticated
  with check (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

drop policy if exists "invitation_recipients_update" on public.invitation_recipients;
create policy "invitation_recipients_update" on public.invitation_recipients
  for update to authenticated
  using (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

drop policy if exists "invitation_recipients_delete" on public.invitation_recipients;
create policy "invitation_recipients_delete" on public.invitation_recipients
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- ── RPCs ─────────────────────────────────────────────────────────────────

create or replace function public.submit_rsvp(
  p_rsvp_token text,
  p_response text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_recipient_id  uuid;
  v_campaign_id   uuid;
  v_campaign_title text;
begin
  if p_response not in ('yes', 'no', 'maybe') then
    raise exception 'Invalid RSVP response: %', p_response;
  end if;

  select id, campaign_id into v_recipient_id, v_campaign_id
  from public.invitation_recipients
  where rsvp_token = p_rsvp_token
  limit 1;

  if v_recipient_id is null then
    raise exception 'Invalid or expired RSVP token';
  end if;

  select title into v_campaign_title
  from public.invitation_campaigns
  where id = v_campaign_id;

  update public.invitation_recipients
  set
    rsvp_response = p_response,
    rsvp_at      = now(),
    rsvp_notes   = p_notes,
    updated_at   = now()
  where id = v_recipient_id;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (null, 'invitation_rsvp_' || p_response, 'invitation_campaign', v_campaign_id);

  return jsonb_build_object(
    'success',         true,
    'message',         format('Thanks! Your RSVP (%s) for "%s" has been recorded.', p_response, v_campaign_title),
    'campaign_title',  v_campaign_title,
    'rsvp_response',   p_response
  );
end;
$$;

grant execute on function public.submit_rsvp(text, text, text) to anon, authenticated;

create or replace function public.get_campaign_guest_list(p_campaign_id uuid)
returns table (
  recipient_name  text,
  recipient_email text,
  rsvp_response   text,
  rsvp_at         timestamptz,
  rsvp_notes      text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin') then
    raise exception 'Unauthorized';
  end if;

  return query
  select ir.recipient_name, ir.recipient_email, ir.rsvp_response, ir.rsvp_at, ir.rsvp_notes
  from public.invitation_recipients ir
  where ir.campaign_id = p_campaign_id
  order by ir.rsvp_response desc, ir.recipient_name asc;
end;
$$;

grant execute on function public.get_campaign_guest_list(uuid) to authenticated;

create or replace function public.get_campaign_rsvp_summary(p_campaign_id uuid)
returns table (
  total_sent    int,
  responded     int,
  rsvp_yes      int,
  rsvp_no       int,
  rsvp_maybe    int,
  response_rate numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin') then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    (select count(*)::int   from public.invitation_recipients where campaign_id = p_campaign_id),
    (select count(*)::int   from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response != 'pending'),
    (select count(*)::int   from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'yes'),
    (select count(*)::int   from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'no'),
    (select count(*)::int   from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'maybe'),
    (
      select (count(*) filter (where rsvp_response != 'pending')::numeric /
              nullif(count(*)::numeric, 0) * 100)
      from public.invitation_recipients
      where campaign_id = p_campaign_id
    )::numeric;
end;
$$;

grant execute on function public.get_campaign_rsvp_summary(uuid) to authenticated;

-- ── Force PostgREST schema reload ─────────────────────────────────────────
-- Ensures the tables are visible immediately after this migration applies,
-- without needing a manual Dashboard "Reload API" step.
notify pgrst, 'reload schema';
