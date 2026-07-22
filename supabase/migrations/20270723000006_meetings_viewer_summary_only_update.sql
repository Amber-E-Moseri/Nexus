-- Live recording is now available to everyone who can view a meeting (see
-- MeetingDetailView.jsx / MeetingRecordTabs.jsx), but non-editor viewers
-- must still never be able to rename/delete/edit the agenda/attendees/
-- context of a meeting they don't own or manage. Prior to this migration,
-- meetings_update had no branch at all for plain viewers, so the AI-notes/
-- transcript save (meetings.summary update) silently failed (0 rows
-- affected) for any user who wasn't the creator, an allowed_editor, or a
-- leadership role — a pre-existing bug, now fixed narrowly: any user who
-- satisfies the meetings_select view-access predicate can update the row,
-- but a BEFORE UPDATE trigger restricts them (unless they independently
-- qualify as a full editor) to changing only `summary` (and the
-- system-managed `updated_at`). Full editors are completely unaffected.

-- Single source of truth for "is this user already a full editor of this
-- meeting", factored out of meetings_update's pre-existing branches so the
-- new restriction trigger (below) can check it without duplicating/drifting
-- from the policy.
create or replace function public.is_meetings_full_editor(
  p_created_by uuid,
  p_department_id uuid,
  p_visibility text,
  p_allowed_editors uuid[]
)
returns boolean
language sql
stable
as $$
  select
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(p_created_by, p_visibility)
    )
    or auth.uid() = any(p_allowed_editors)
    or p_created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and p_visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), p_department_id, 'dept_lead')
      and p_visibility = 'published'
    )
    or (
      public.user_has_grant(auth.uid(), 'meetings_manager')
      and p_visibility = 'published'
    );
$$;

-- BEFORE UPDATE trigger: for anyone who is NOT a full editor (i.e. they only
-- reached meetings_update via the new viewer-access branch below), restrict
-- the write to the `summary` column only. `updated_at` is exempted too since
-- it's system-managed by the existing update_meetings_timestamp trigger.
-- Uses a generic jsonb diff (rather than an enumerated column list, since
-- `meetings` has 29 columns spread across many migrations) so it stays
-- correct as columns are added in future migrations.
--
-- Security-critical: the editor check below evaluates against OLD, never
-- NEW. If it evaluated against NEW instead, a non-editor could submit a
-- single UPDATE that both adds themselves to allowed_editors AND changes
-- other columns in the same statement — the editor-check would see their
-- own just-added grant and wave the whole diff through, self-authorizing
-- the edit. Evaluating against OLD closes that: whether someone is exempt
-- from the column restriction is decided by their permissions *before* the
-- edit, never by what the edit itself claims.
--
-- Ordering note: this trigger is named to sort alphabetically before the
-- two existing BEFORE UPDATE triggers on public.meetings
-- (force_regionalsec_meetings_private, update_meetings_timestamp), so it
-- always evaluates the raw client-submitted diff before any later
-- system-trigger normalization. This ordering is a naming convention, not
-- an enforced guarantee — Postgres runs same-timing triggers in
-- alphabetical-by-name order, so any future trigger added to
-- public.meetings with a name sorting before "enforce_..." would silently
-- run first. Keep that in mind if adding new BEFORE UPDATE triggers here.
create or replace function public.enforce_meetings_summary_only_update()
returns trigger as $$
declare
  old_rest jsonb;
  new_rest jsonb;
begin
  if public.is_meetings_full_editor(old.created_by, old.department_id, old.visibility, old.allowed_editors) then
    return new;
  end if;

  old_rest := to_jsonb(old) - 'summary' - 'updated_at';
  new_rest := to_jsonb(new) - 'summary' - 'updated_at';

  if old_rest is distinct from new_rest then
    raise exception 'Only the summary field can be updated without meeting-edit permission';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_meetings_summary_only_update on public.meetings;

create trigger enforce_meetings_summary_only_update
  before update on public.meetings
  for each row
  execute function public.enforce_meetings_summary_only_update();

-- Extend meetings_update: add the meetings_select view-access predicate as a
-- new set of OR branches so anyone who can view a meeting can also attempt
-- to update it (the trigger above is what actually restricts non-editors to
-- summary-only writes). All pre-existing branches are reproduced verbatim,
-- unchanged, so full editors keep exactly their current access.
drop policy if exists "meetings_update" on public.meetings;

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or auth.uid() = any(allowed_editors)
    or created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant(auth.uid(), 'meetings_manager')
      and visibility = 'published'
    )
    -- New: view-access branches (verbatim copy of meetings_select's USING
    -- predicate) — grants summary-only write access via the trigger above.
    or auth.uid() = any(allowed_viewers)
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = auth.uid()
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      and public.current_user_role() is distinct from 'group_member'
      and (department_id = public.current_user_department() or department_id is null)
    )
  );
