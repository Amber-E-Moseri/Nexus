-- Add retry logic columns to communication_campaigns
alter table public.communication_campaigns
  add column if not exists retry_count integer default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error_at timestamptz;

-- Add suppressed count tracking to communication_campaigns
alter table public.communication_campaigns
  add column if not exists suppressed_count integer default 0;

-- Update communication_sends status enum to include 'retrying' and 'suppressed'
alter table public.communication_sends
  drop constraint if exists communication_sends_status_check;

alter table public.communication_sends
  add constraint communication_sends_status_check
  check (status in ('pending','sent','failed','opened','bounced','unsubscribed','retrying','suppressed'));

-- Add last_error_at to communication_sends
alter table public.communication_sends
  add column if not exists last_error_at timestamptz;

-- RPC: handle bounce events from Resend webhook
create or replace function public.handle_bounce_event(
  p_email text,
  p_bounce_type text,
  p_bounced_at timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounced_count integer := 0;
begin
  -- Upsert into email_bounces, marking as suppressed
  insert into public.email_bounces (email, bounce_type, bounced_at, suppressed, updated_at)
  values (p_email, p_bounce_type, p_bounced_at, true, now())
  on conflict (email) do update
  set bounce_type = excluded.bounce_type,
      bounced_at = excluded.bounced_at,
      suppressed = true,
      updated_at = now();

  -- Count how many sends will be affected
  select count(*) into v_bounced_count
  from public.communication_sends
  where recipient_email = p_email and status in ('sent', 'pending', 'retrying');

  return json_build_object(
    'email', p_email,
    'bounce_type', p_bounce_type,
    'affected_sends', v_bounced_count
  );
end;
$$;

-- RPC: get suppression list (paginated, searchable)
create or replace function public.get_suppression_list(
  p_search text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  email text,
  bounce_type text,
  bounced_at timestamptz,
  suppressed boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select email, bounce_type, bounced_at, suppressed, updated_at
  from public.email_bounces
  where suppressed = true
    and (p_search = '' or email ilike '%' || p_search || '%')
  order by bounced_at desc
  limit p_limit
  offset p_offset;
$$;

-- RPC: un-suppress a single email
create or replace function public.unsuppress_email(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  update public.email_bounces
  set suppressed = false, updated_at = now()
  where email = p_email;

  if found then
    v_result := json_build_object('success', true, 'email', p_email);
  else
    v_result := json_build_object('success', false, 'error', 'Email not found in suppression list');
  end if;

  return v_result;
end;
$$;

-- RPC: un-suppress all emails
create or replace function public.unsuppress_all()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.email_bounces
  set suppressed = false, updated_at = now()
  where suppressed = true;

  get diagnostics v_count = row_count;

  return json_build_object('success', true, 'unsuppressed_count', v_count);
end;
$$;

-- RPC: get bounce metrics (for analytics dashboard)
create or replace function public.get_bounce_metrics()
returns table(
  total_bounced integer,
  hard_bounces integer,
  soft_bounces integer,
  suppressed_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) as total_bounced,
    count(*) filter (where bounce_type = 'hard') as hard_bounces,
    count(*) filter (where bounce_type = 'soft') as soft_bounces,
    count(*) filter (where suppressed = true) as suppressed_count
  from public.email_bounces;
$$;

-- RPC: retry a failed campaign
create or replace function public.retry_failed_campaign(p_campaign_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
  v_new_retry_count integer;
begin
  select * into v_campaign
  from public.communication_campaigns
  where id = p_campaign_id;

  if not found then
    return json_build_object('success', false, 'error', 'Campaign not found');
  end if;

  if v_campaign.status != 'failed' then
    return json_build_object('success', false, 'error', 'Can only retry failed campaigns');
  end if;

  v_new_retry_count := v_campaign.retry_count + 1;

  if v_new_retry_count > 3 then
    return json_build_object('success', false, 'error', 'Maximum retry attempts exceeded');
  end if;

  -- Mark as retrying and increment retry count
  update public.communication_campaigns
  set status = 'retrying',
      retry_count = v_new_retry_count,
      next_retry_at = null,
      updated_at = now()
  where id = p_campaign_id;

  -- Call send function
  perform http_post(
    url := v_url || '/functions/v1/send-communication-email',
    body := json_build_object('campaign_id', p_campaign_id)::text,
    content_type := 'application/json',
    headers := array[http_header('Authorization', 'Bearer ' || v_key)]
  );

  return json_build_object('success', true, 'retry_count', v_new_retry_count);
end;
$$;
