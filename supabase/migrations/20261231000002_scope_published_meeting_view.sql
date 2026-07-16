-- Fix: scope PUBLISHED meeting visibility to the same department (so plain
-- members only see their own department's meetings), AND make group-space
-- members see ONLY their group's meetings.
--
-- The live select policy "users_view_meetings" (20260911) exposes any meeting
-- with visibility='published' to EVERY authenticated user, org-wide. Since new
-- meetings default to 'published', members currently see all departments'
-- meetings. This scopes the published path to the viewer's own department.
--
-- Group spaces are departments rows with space_type='group'; membership lives in
-- group_space_members (group_space_id, user_id). A group member's users
-- .department_id is NULL, and a group meeting carries department_id = the group
-- space id. Requirements:
--   • Group members can ONLY see their own group's meeting info.
--   • Group meetings are private to that group — only its members (and
--     super_admin, via meetings_select_access) can see them.
-- So group members get a membership-based path (any visibility) and are excluded
-- from the org-wide published / no-department path that other roles keep.
--
-- Meetings with NO department (department_id IS NULL) are genuinely org-wide and
-- remain visible to all NON-group authenticated users when published (ad-hoc /
-- general meetings — see 20261230000009).
--
-- Combined with meetings_select_access (super_admin / ORS-department /
-- dept_lead-scoped / meetings_manager grant / creator), the net effect:
--   • super_admin, ORS, grant holders   → all meetings
--   • dept_lead                         → their department's meetings
--   • member                            → their department's published meetings
--                                          + org-wide (no-dept) published + own + invited
--   • group_member                      → ONLY their group space(s)' meetings
--                                          (+ own + explicit invites)
--   • creator / invited                 → those specific meetings
--
-- Standalone; does not depend on the unapplied phase-3 RLS swap. This NARROWS
-- visibility relative to today.

drop policy if exists "users_view_meetings" on public.meetings;

create policy "users_view_meetings" on public.meetings
  for select to authenticated
  using (
    -- Group-space members see meetings in their group space(s), regardless of
    -- visibility (the space is private to the group). This is also the ONLY
    -- broad path available to group_member users — see the role guard below.
    exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = auth.uid()
        and gsm.group_space_id = meetings.department_id
    )
    -- Everyone EXCEPT group members gets the normal published paths:
    -- same-department published, or genuinely org-wide (no-department) published.
    or (
      public.current_user_role() is distinct from 'group_member'
      and visibility = 'published'
      and (
        department_id = public.current_user_department()
        or department_id is null
      )
    )
    -- Creator always sees their own
    or created_by = auth.uid()
    -- Explicitly invited viewers/editors
    or auth.uid() = any(allowed_viewers)
    or auth.uid() = any(allowed_editors)
  );
