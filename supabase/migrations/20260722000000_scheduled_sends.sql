-- Automatic campaign sending via pg_cron
--
-- Hosted Supabase does not permit `alter database ... set` from a migration
-- (it requires superuser). Instead, store the two settings in a tiny config
-- table that the functions below read. After applying, run ONCE:
--
--   insert into public.app_settings (key, value) values
--     ('supabase_url', 'https://[your-ref].supabase.co'),
--     ('service_role_key', '[service-role-key]')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_cron;
create extension if not exists http;

-- Config holder for server-side settings (service role / SQL editor only).
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

alter table public.app_settings enable row level security;
-- No policies => only service_role / definer functions can read it.

create or replace function public.app_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key
$$;

-- Fire all campaigns whose scheduled_at has passed (within 1-hour window to prevent re-fires)
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
    select id, subject, body
    from public.communication_campaigns
    where status = 'scheduled'
      and scheduled_at <= now()
      and scheduled_at > now() - interval '1 hour'
  loop
    -- Mark as sending immediately to prevent double-fire
    update public.communication_campaigns
    set status = 'sending', updated_at = now()
    where id = campaign.id;

    -- Call the edge function
    perform http_post(
      url         := v_url || '/functions/v1/send-communication-email',
      body        := json_build_object(
                       'campaign_id', campaign.id,
                       'subject',     campaign.subject,
                       'body',        campaign.body
                     )::text,
      content_type := 'application/json',
      headers     := array[
                       http_header('Authorization', 'Bearer ' || v_key)
                     ]
    );

    raise log 'Fired campaign %', campaign.id;
  end loop;
end;
$$;

-- Schedule: every minute
select cron.schedule(
  'fire-scheduled-campaigns',
  '* * * * *',
  'select public.fire_scheduled_campaigns()'
);

-- Fallback RPC for environments without pg_cron
-- Frontend usage: supabase.rpc('check_and_fire_campaigns_manually')
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
    select id, subject, body
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
      body         := json_build_object(
                        'campaign_id', campaign.id,
                        'subject',     campaign.subject,
                        'body',        campaign.body
                      )::text,
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
