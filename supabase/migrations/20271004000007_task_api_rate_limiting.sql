-- Per-API-key rate limiting for the task-api Edge Function.
--
-- task-api calls rpc('check_and_increment_rate_limit', { p_key_id, p_max_requests: 60 }) on every
-- authenticated request. That RPC existed only in the retired .bak_20260626000000_rate_limits.sql
-- (which owned a per-key table named `rate_limits`); the September IP/email limiter later took the
-- `rate_limits` name, so the RPC was never created and every call returned 503 "Rate limit check failed".
--
-- This migration adds a dedicated table (no overlap with the IP/email `rate_limits` table, which is
-- left untouched) and the RPC with the signature/return shape task-api already consumes:
--   { allowed boolean, count int, retry_after int (seconds), limit int }
-- Fixed 60s windows; one atomic INSERT .. ON CONFLICT DO UPDATE per call. The key is identified by
-- api_keys.id only: no plaintext key and no hash is stored here.

create table if not exists public.task_api_rate_limits (
  key_id        uuid        not null references public.api_keys(id) on delete cascade,
  window_start  timestamptz not null,
  request_count integer     not null default 0 check (request_count >= 0),
  primary key (key_id, window_start)
);

create index if not exists task_api_rate_limits_window_idx on public.task_api_rate_limits (window_start);

alter table public.task_api_rate_limits enable row level security;
-- No policies on purpose: only SECURITY DEFINER code / service_role touches this table.
revoke all on public.task_api_rate_limits from public, anon, authenticated;

create or replace function public.check_and_increment_rate_limit(p_key_id uuid, p_max_requests integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_key_id is null then
    raise exception 'p_key_id is required' using errcode = '22023';
  end if;
  if p_max_requests is null or p_max_requests < 1 then
    raise exception 'p_max_requests must be >= 1' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / 60) * 60);

  insert into public.task_api_rate_limits as r (key_id, window_start, request_count)
  values (p_key_id, v_window_start, 1)
  on conflict (key_id, window_start)
  do update set request_count = r.request_count + 1
  returning r.request_count into v_count;

  -- housekeeping when a key opens a new window: drop that key's windows older than an hour
  if v_count = 1 then
    delete from public.task_api_rate_limits
    where key_id = p_key_id and window_start < v_window_start - interval '1 hour';
  end if;

  return jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'count', v_count,
    'limit', p_max_requests,
    'retry_after', case
      when v_count > p_max_requests
        then greatest(1, ceil(extract(epoch from (v_window_start + interval '1 minute' - v_now)))::integer)
      else 0 end
  );
end;
$$;

revoke all on function public.check_and_increment_rate_limit(uuid, integer) from public, anon, authenticated;
grant execute on function public.check_and_increment_rate_limit(uuid, integer) to service_role;
