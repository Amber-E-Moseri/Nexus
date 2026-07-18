-- Consolidate sprints SELECT into one clean open policy.
-- Drops stale stacked policies from prior migrations.
-- Idempotent: safe if any of these were already applied.
drop policy if exists "sprints_select"                on public.sprints;
drop policy if exists "sprints_select_space_access"   on public.sprints;
drop policy if exists "sprints_select_authenticated"  on public.sprints;

create policy "sprints_select" on public.sprints
  for select to authenticated
  using (true);
