-- Fix sprint_members_select circular deadlock introduced by 20270719000005.
--
-- Root cause: 20270719000005 recreated sprint_members_select without the
-- `user_id = auth.uid()` escape hatch that existed in 20260808000000. Without
-- it, is_sprint_member() (a non-security-definer function) queries
-- sprint_members under the caller's RLS — which requires is_sprint_member() to
-- return true first. Regular contributors could no longer see their own
-- membership rows, making every sprint appear empty.
--
-- Two-part fix:
-- 1. Make is_sprint_member() SECURITY DEFINER so it bypasses RLS internally.
--    This breaks the circular dependency permanently — future SELECT policy
--    rewrites no longer risk re-introducing the deadlock.
-- 2. Add `user_id = auth.uid()` back as a belt-and-suspenders escape hatch so
--    a member can always see their own row regardless of helper function state.

-- 1. Rebuild is_sprint_member as SECURITY DEFINER
create or replace function public.is_sprint_member(p_sprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sprint_members
    where sprint_id = p_sprint_id
      and user_id = auth.uid()
  )
$$;

-- 2. Restore sprint_members_select with the escape hatch
drop policy if exists "sprint_members_select" on public.sprint_members;

create policy "sprint_members_select" on public.sprint_members
  for select to authenticated
  using (
    public.has_sprint_viewer_privilege()
    or user_id = auth.uid()
    or public.is_sprint_member(sprint_id)
  );
