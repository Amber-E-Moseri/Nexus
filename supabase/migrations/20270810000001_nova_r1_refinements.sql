-- Nova Release 1 Refinements
-- 1. KB full-text search RPC + GIN index
-- 2. nova_kb_query_log table (tracks KB hit rate + token savings)
-- 3. nova_audit_log cost columns (input/output/cache breakdown + cost_usd_cents)
-- 4. Cost analytics RPCs (SECURITY DEFINER, admin-gated)

-- ─── 1. GIN index on KB entries ───────────────────────────────────────────────

create index if not exists nova_kb_search_idx
  on public.nova_kb_entries
  using gin (to_tsvector('english', question || ' ' || coalesce(answer, '')));

-- ─── 2. KB full-text search RPC ───────────────────────────────────────────────
-- Callable by authenticated users; RLS on nova_kb_entries restricts to active rows.
-- Returns at most p_limit results with rank >= p_min_rank.
-- Caller decides what rank threshold to treat as a "direct match" (no Claude needed).

create or replace function public.search_nova_kb(
  p_query text,
  p_limit integer default 5,
  p_min_rank float default 0.1
)
returns table (
  id uuid,
  slug text,
  question text,
  answer text,
  rank float,
  matched_fields text[]
)
language sql
stable
as $$
  with ranked as (
    select
      ne.id,
      ne.slug,
      ne.question,
      ne.answer,
      ts_rank(to_tsvector('english', ne.question), plainto_tsquery('english', p_query)) * 2 as q_rank,
      ts_rank(to_tsvector('english', coalesce(ne.answer, '')), plainto_tsquery('english', p_query)) as a_rank
    from public.nova_kb_entries ne
    where ne.status = 'active'
      and (
        to_tsvector('english', ne.question) @@ plainto_tsquery('english', p_query)
        or to_tsvector('english', coalesce(ne.answer, '')) @@ plainto_tsquery('english', p_query)
      )
  )
  select
    r.id,
    r.slug,
    r.question,
    r.answer,
    (r.q_rank + r.a_rank)::float as rank,
    case
      when r.q_rank > 0 and r.a_rank > 0 then array['question', 'answer']::text[]
      when r.q_rank > 0 then array['question']::text[]
      else array['answer']::text[]
    end as matched_fields
  from ranked r
  where (r.q_rank + r.a_rank) >= p_min_rank
  order by (r.q_rank + r.a_rank) desc
  limit p_limit;
$$;

grant execute on function public.search_nova_kb to authenticated;

-- ─── 3. KB query log ──────────────────────────────────────────────────────────
-- Tracks whether each Ask Nexus request was served from KB or needed Claude.
-- Owned-row-only policy; admins query aggregates via the cost RPCs below.

create table if not exists public.nova_kb_query_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  department_id uuid references public.departments(id),
  query text not null,
  kb_matched boolean not null default false,
  kb_rank float,
  kb_confidence text check (kb_confidence in ('high', 'medium', 'low')),
  direct_match boolean not null default false,
  claude_used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.nova_kb_query_log enable row level security;

create policy nova_kb_query_log_own on public.nova_kb_query_log
  for all using (user_id = auth.uid());

create index nova_kb_query_log_user_idx on public.nova_kb_query_log (user_id, created_at desc);

-- ─── 4. nova_audit_log cost columns ──────────────────────────────────────────
-- tokens_used already exists as a total; add the breakdown + cost.
-- Use separate ADD COLUMN statements (PostgreSQL syntax requirement).

alter table public.nova_audit_log add column if not exists input_tokens integer;
alter table public.nova_audit_log add column if not exists output_tokens integer;
alter table public.nova_audit_log add column if not exists cache_creation_input_tokens integer;
alter table public.nova_audit_log add column if not exists cache_read_input_tokens integer;
alter table public.nova_audit_log add column if not exists cost_usd_cents integer;
alter table public.nova_audit_log add column if not exists prompt_cache_hit boolean default false;
alter table public.nova_audit_log add column if not exists cache_breakpoint_version text;

create index if not exists nova_audit_cost_idx
  on public.nova_audit_log (created_at, intent, cost_usd_cents);

-- ─── 5. Cost analytics RPCs ───────────────────────────────────────────────────
-- Both are SECURITY DEFINER + search_path pinned (bypass row-level policy to
-- aggregate across all users). Manual role check inside each function body.
-- BLW CAN NEXUS is single-tenant — no org filter needed.

create or replace function public.estimate_nova_monthly_cost()
returns table (estimated_total_usd numeric, daily_avg_usd numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user_role() not in ('super_admin', 'regional_secretary') then
    raise exception 'permission denied';
  end if;

  return query
    select
      coalesce(sum(cost_usd_cents), 0)::numeric / 100 as estimated_total_usd,
      (coalesce(sum(cost_usd_cents), 0)::numeric / 100)
        / nullif(count(distinct date(created_at))::numeric, 0) as daily_avg_usd
    from public.nova_audit_log
    where created_at >= date_trunc('month', now());
end;
$$;

grant execute on function public.estimate_nova_monthly_cost to authenticated;

create or replace function public.nova_cost_by_intent(p_days integer default 7)
returns table (
  intent text,
  call_count bigint,
  avg_cost_cents numeric,
  total_cost_cents bigint,
  percent_of_total numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  if current_user_role() not in ('super_admin', 'regional_secretary') then
    raise exception 'permission denied';
  end if;

  select coalesce(sum(cost_usd_cents), 0) into v_total
  from public.nova_audit_log
  where created_at >= now() - (p_days || ' days')::interval;

  return query
    select
      al.intent,
      count(*)::bigint as call_count,
      round(avg(coalesce(al.cost_usd_cents, 0)), 2) as avg_cost_cents,
      sum(coalesce(al.cost_usd_cents, 0))::bigint as total_cost_cents,
      round(
        sum(coalesce(al.cost_usd_cents, 0))::numeric / nullif(v_total::numeric, 0) * 100,
        1
      ) as percent_of_total
    from public.nova_audit_log al
    where al.created_at >= now() - (p_days || ' days')::interval
    group by al.intent
    order by total_cost_cents desc;
end;
$$;

grant execute on function public.nova_cost_by_intent to authenticated;

-- ─── 6. KB savings RPC (aggregates nova_kb_query_log for admins) ─────────────

create or replace function public.nova_kb_savings_summary(p_days integer default 7)
returns table (
  total_ask_queries bigint,
  kb_direct_matches bigint,
  claude_calls bigint,
  direct_match_rate_pct numeric,
  estimated_tokens_saved bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user_role() not in ('super_admin', 'regional_secretary') then
    raise exception 'permission denied';
  end if;

  return query
    select
      count(*)::bigint as total_ask_queries,
      count(*) filter (where direct_match)::bigint as kb_direct_matches,
      count(*) filter (where claude_used)::bigint as claude_calls,
      round(
        count(*) filter (where direct_match)::numeric / nullif(count(*)::numeric, 0) * 100,
        1
      ) as direct_match_rate_pct,
      (count(*) filter (where direct_match) * 250)::bigint as estimated_tokens_saved
    from public.nova_kb_query_log
    where created_at >= now() - (p_days || ' days')::interval;
end;
$$;

grant execute on function public.nova_kb_savings_summary to authenticated;
