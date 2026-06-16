-- Per-key rate limiting for the task-api edge function.
-- One row per (key_id, window_start) tracks the request count within that minute window.
-- Increments are atomic via INSERT ... ON CONFLICT DO UPDATE so concurrent requests
-- from the same key never double-count or race.

create table if not exists public.rate_limits (
  key_id       uuid        not null references public.api_keys(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer    not null default 0,
  primary key (key_id, window_start)
);

-- Only the service role (edge functions) should touch this table.
alter table public.rate_limits enable row level security;

create policy "rate_limits_service_only" on public.rate_limits
  as restrictive
  for all
  to authenticated
  using (false);

-- Atomically increments the counter for the current 1-minute window and returns
-- whether the request is allowed plus how many seconds remain in the window.
create or replace function public.check_and_increment_rate_limit(
  p_key_id      uuid,
  p_max_requests integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start  timestamptz;
  v_window_end    timestamptz;
  v_count         integer;
begin
  v_window_start := date_trunc('minute', now());
  v_window_end   := v_window_start + interval '1 minute';

  -- Remove stale windows to keep the table small.
  delete from public.rate_limits
  where key_id = p_key_id
    and window_start < v_window_start;

  insert into public.rate_limits (key_id, window_start, request_count)
  values (p_key_id, v_window_start, 1)
  on conflict (key_id, window_start)
  do update set request_count = rate_limits.request_count + 1
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed',      v_count <= p_max_requests,
    'count',        v_count,
    'retry_after',  case
                      when v_count > p_max_requests
                      then greatest(0, extract(epoch from (v_window_end - now()))::integer)
                      else 0
                    end
  );
end;
$$;
