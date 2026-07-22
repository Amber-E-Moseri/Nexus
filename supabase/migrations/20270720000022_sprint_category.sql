-- Sprints can be labeled 'group' (pastoral group / small-team initiative) or
-- 'regional' (whole sub-region). Purely a display/filter tag — no RLS or
-- membership behavior depends on it.

alter table public.sprints
  add column if not exists category text
  check (category is null or category in ('group', 'regional'));
