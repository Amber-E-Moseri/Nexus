-- Fix: infinite recursion detected in policy for relation "meetings"
--
-- 20270803000001 fixed meeting_spaces_select's self-reference to
-- meeting_spaces, but the deeper problem remains: meetings_select
-- queries meeting_spaces directly (its cross-dept share clause), and
-- meeting_spaces_select queries meetings directly (to check parent
-- visibility). These are two different tables, but Postgres still
-- detects the mutual cycle when evaluating either policy:
--   meetings_select -> EXISTS(meeting_spaces) -> meeting_spaces_select
--     -> EXISTS(meetings) -> meetings_select -> ...
--
-- Fix (matches the existing is_task_assignee() / has_space_role()
-- pattern used elsewhere in this codebase): wrap the meeting_spaces
-- lookup in a STABLE SECURITY DEFINER function. Security definer
-- functions run as their owner (bypasses RLS on the tables they query),
-- so calling this function from meetings_select no longer invokes
-- meeting_spaces_select at all, breaking the cycle.

create or replace function public.meeting_shared_with_department(p_meeting_id uuid, p_dept_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meeting_spaces ms
    where ms.meeting_id = p_meeting_id and ms.department_id = p_dept_id
  );
$$;

-- ── Patch: meetings_select ────────────────────────────────────────
-- Replace the raw EXISTS(meeting_spaces) cross-dept clause with the
-- security-definer function call.

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    (
      (select public.current_user_role()) = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or created_by = (select auth.uid())
    or (select auth.uid()) = any(allowed_viewers)
    or (select auth.uid()) = any(allowed_editors)
    or (
      ((select public.current_user_role()) = 'regional_secretary'
       or public.has_space_role_anywhere((select auth.uid()), 'ors'))
      and visibility = 'published'
    )
    or (
      public.has_space_role((select auth.uid()), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant((select auth.uid()), 'meetings_manager')
      and visibility = 'published'
    )
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = (select auth.uid())
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      and (select public.current_user_role()) is distinct from 'group_member'
      and (department_id = (select public.current_user_department()) or department_id is null)
    )
    or (
      visibility = 'published'
      and (select public.current_user_role()) is distinct from 'group_member'
      and public.meeting_shared_with_department(id, (select public.current_user_department()))
    )
  );

-- ── Patch: open_items_select ───────────────────────────────────────
-- Same swap for meeting_open_items' cross-dept clause.

drop policy if exists "open_items_select" on public.meeting_open_items;

create policy "open_items_select" on public.meeting_open_items
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and (
          (
            (select public.current_user_role()) = 'super_admin'
            and not public.is_regionalsecretary_private_meeting(m.created_by, m.visibility)
          )
          or m.created_by = (select auth.uid())
          or (select auth.uid()) = any(m.allowed_editors)
          or (
            ((select public.current_user_role()) = 'regional_secretary'
             or public.has_space_role_anywhere((select auth.uid()), 'ors'))
            and m.visibility = 'published'
          )
          or (
            public.has_space_role((select auth.uid()), m.department_id, 'dept_lead')
            and m.visibility = 'published'
          )
          or (
            public.user_has_grant((select auth.uid()), 'meetings_manager')
            and m.visibility = 'published'
          )
          or exists (
            select 1 from public.group_space_members gsm
            where gsm.user_id = (select auth.uid()) and gsm.group_space_id = m.department_id
          )
          or (
            m.visibility = 'published'
            and (select public.current_user_role()) is distinct from 'group_member'
            and (m.department_id = (select public.current_user_department()) or m.department_id is null)
          )
          or (
            (select auth.uid()) = any(m.allowed_viewers)
            and (m.meeting_type is distinct from '1_on_1_meeting'
                 or (select auth.uid()) = any(m.notes_shared_with))
          )
          or (
            m.visibility = 'published'
            and (select public.current_user_role()) is distinct from 'group_member'
            and public.meeting_shared_with_department(m.id, (select public.current_user_department()))
          )
        )
    )
  );
