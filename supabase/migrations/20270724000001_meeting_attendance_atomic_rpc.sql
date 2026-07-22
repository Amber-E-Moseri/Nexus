-- =============================================================================
-- Atomic meeting attendance RPC
-- -----------------------------------------------------------------------------
-- MeetingModal.jsx and MeetingDetailView.jsx both saved attendance as an
-- unguarded client-side DELETE FROM meeting_attendance immediately followed
-- by a separate INSERT, with no transaction. If the insert failed after the
-- delete succeeded (network blip, one bad user_id, RLS hiccup), attendees
-- were silently wiped — MeetingDetailView.jsx even re-fetched and overwrote
-- local state unconditionally, turning a failed save into a visible data
-- loss. This RPC wraps both steps in one SECURITY DEFINER function body, so
-- Postgres's implicit function-body transaction makes the pair atomic.
--
-- AUTHORIZATION SYNC WARNING: SECURITY DEFINER bypasses RLS, so this
-- function re-implements the meetings_update authorization union as
-- application code instead of relying on the caller's RLS. That union is
-- copied verbatim from the "meetings_update" policy defined in
-- 20270722000006_exclude_super_admin_from_regionalsecretary_private_meetings.sql.
-- If that policy is ever edited, this function's copy must be updated to
-- match in the same change — see supabase/migration-log.md for the
-- corresponding entry flagging this pair.
-- =============================================================================

create or replace function public.set_meeting_attendance(p_meeting_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.meetings%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into m from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'Meeting not found' using errcode = 'P0002';
  end if;

  if not (
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(m.created_by, m.visibility)
    )
    or v_uid = any(m.allowed_editors)
    or m.created_by = v_uid
    or (
      public.has_space_role_anywhere(v_uid, 'ors')
      and m.visibility = 'published'
    )
    or (
      public.has_space_role(v_uid, m.department_id, 'dept_lead')
      and m.visibility = 'published'
    )
    or public.user_has_grant(v_uid, 'meetings_manager')
  ) then
    raise exception 'Not authorized to edit attendance for this meeting' using errcode = '42501';
  end if;

  delete from public.meeting_attendance where meeting_id = p_meeting_id;

  if p_user_ids is not null and array_length(p_user_ids, 1) > 0 then
    insert into public.meeting_attendance (meeting_id, user_id, status)
    select p_meeting_id, uid, 'present'
    from unnest(p_user_ids) as uid;
  end if;
end;
$$;

grant execute on function public.set_meeting_attendance(uuid, uuid[]) to authenticated;
