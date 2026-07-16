-- Correction: the meeting-visibility scoping added in 20261231000001/000002
-- assumed the phase-3 RLS swap (20261216000000) was NOT yet live and worked
-- by recreating the pre-phase-3 policies "meetings_select_access" /
-- "users_view_meetings" with tighter logic.
--
-- It turns out phase-3 WAS already applied to this database (confirmed via
-- `supabase migration list` — 20261216000000 was not in the pending-push
-- list). Phase-3 replaced those two policies with a single "meetings_select"
-- policy that includes its own unconditional `or visibility = 'published'`
-- clause — no department scoping at all. Since Postgres OR's every permissive
-- SELECT policy together, that clause alone already grants every
-- authenticated user (member, dept_lead, group_member) visibility into every
-- published meeting org-wide, completely bypassing the department/group
-- scoping 20261231000001/000002 tried to add via separate policies. Those two
-- policies are still installed but are now dead weight — never the deciding
-- factor, since meetings_select's broader clause always passes first.
--
-- Fix: patch "meetings_select" itself (the policy that actually decides
-- visibility) instead of adding more competing policies. Also retires the
-- 20261231000000 "meetings_delete_admin_fix" policy, which turned out to be
-- fully redundant with phase-3's "meetings_delete" (which already covers
-- super_admin, ORS, creator, dept_lead, meetings_manager grant — the exact
-- set 20261231000000 re-implemented from scratch, unaware phase-3's version
-- already existed).
--
-- Net visibility after this migration:
--   • super_admin / regional_secretary / ORS / meetings_manager grant → all
--   • dept_lead                                                        → own department (+ own/invited)
--   • group_member                                                     → ONLY their group space(s)' meetings (+ own/invited)
--   • everyone else (member)                                           → own department's published meetings,
--                                                                          org-wide published meetings with no department,
--                                                                          + own/invited

drop policy if exists "meetings_select_access" on public.meetings;
drop policy if exists "users_view_meetings" on public.meetings;
drop policy if exists "meetings_delete_admin_fix" on public.meetings;

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or created_by = auth.uid()
    or auth.uid() = any(allowed_viewers)
    or auth.uid() = any(allowed_editors)
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
    -- Group-space members: their group's meetings only, any visibility —
    -- the group space is private to its members.
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = auth.uid()
        and gsm.group_space_id = meetings.department_id
    )
    -- Published meetings: scoped to the viewer's own department, or
    -- genuinely org-wide ad-hoc meetings (no department). Excludes
    -- group_member — their only path is the group-space clause above, so a
    -- group member never sees another department's or another group's
    -- published meetings just for being "published".
    or (
      visibility = 'published'
      and public.current_user_role() is distinct from 'group_member'
      and (department_id = public.current_user_department() or department_id is null)
    )
  );
