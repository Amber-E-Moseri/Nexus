-- ============================================================
-- MINISTRY CALENDAR — EVENT APPROVAL WORKFLOW
-- ============================================================
-- Adds submit -> review -> approve/reject states to calendar_events.
-- Approver = super_admin OR holder of the existing 'calendar:write'
-- permission (reused rather than inventing a separate 'calendar_editor';
-- has_permission() already returns true for super_admin).
-- Filename uses 20260726… because 20260723000000 is already taken by
-- 20260723000000_fix_sprint_members_role.sql.

-- ---- columns ------------------------------------------------
alter table public.calendar_events
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'draft'));

alter table public.calendar_events
  add column if not exists submitted_by uuid references public.users(id) on delete set null;

alter table public.calendar_events
  add column if not exists approved_by uuid references public.users(id) on delete set null;

alter table public.calendar_events
  add column if not exists approved_at timestamptz;

alter table public.calendar_events
  add column if not exists rejection_reason text;

create index if not exists calendar_events_status_idx on public.calendar_events(status);

-- ---- backfill ----------------------------------------------
-- Events created before this workflow were already live; mark them approved
-- so the new default ('pending') doesn't retroactively hide them. Guarded by
-- submitted_by IS NULL so re-running won't re-approve genuine submissions.
update public.calendar_events
  set status = 'approved'
  where status = 'pending' and submitted_by is null;

-- ---- RLS ----------------------------------------------------
-- Replace the permissive select-all + single write policy with approval-aware
-- policies. Members see only approved events (plus their own submissions);
-- approvers see everything.
drop policy if exists "calendar_events_select_all" on public.calendar_events;
drop policy if exists "calendar_events_select" on public.calendar_events;
drop policy if exists "calendar_events_write" on public.calendar_events;
drop policy if exists "calendar_events_insert" on public.calendar_events;
drop policy if exists "calendar_events_update" on public.calendar_events;
drop policy if exists "calendar_events_delete" on public.calendar_events;

-- The approval gate applies ONLY to org-wide Ministry Calendar events
-- (space_id IS NULL AND sprint_id IS NULL). Space/sprint-scoped events keep
-- their prior behavior (managed by their space/sprint leads), so this migration
-- doesn't break those calendars.

-- SELECT: scoped events stay visible to all (as before). Org-wide events are
-- visible when approved, to approvers, or to their own submitter/creator.
create policy "calendar_events_select"
  on public.calendar_events
  for select
  to authenticated
  using (
    space_id is not null
    or sprint_id is not null
    or status = 'approved'
    or public.has_permission('calendar:write')
    or submitted_by = auth.uid()
    or created_by = auth.uid()
  );

-- INSERT: scoped events unaffected. For org-wide events, a non-approver can
-- only create pending/draft (cannot self-publish approved).
create policy "calendar_events_insert"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    space_id is not null
    or sprint_id is not null
    or public.has_permission('calendar:write')
    or status in ('pending', 'draft')
  );

-- UPDATE: approvers edit/approve/reject any org-wide row; scoped events stay
-- editable by their leads/creators; org-wide submitters can edit their own
-- draft/rejected and resubmit to pending (never self-approve).
create policy "calendar_events_update"
  on public.calendar_events
  for update
  to authenticated
  using (
    public.has_permission('calendar:write')
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead') or created_by = auth.uid()))
    or ((submitted_by = auth.uid() or created_by = auth.uid()) and status in ('draft', 'rejected'))
  )
  with check (
    public.has_permission('calendar:write')
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead') or created_by = auth.uid()))
    or ((submitted_by = auth.uid() or created_by = auth.uid()) and status in ('draft', 'pending', 'rejected'))
  );

-- DELETE: super_admin anywhere; scoped events also by their leads/creators.
create policy "calendar_events_delete"
  on public.calendar_events
  for delete
  to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or public.has_permission('calendar:write')
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') = 'dept_lead' or created_by = auth.uid()))
  );

-- ---- approver lookup ---------------------------------------
-- Members can't read other users' user_permissions rows (RLS), so a submitter
-- can't list approvers to notify them. This security-definer function returns
-- the approver user ids (super_admins + calendar:write holders) so the client
-- can fan out 'calendar_approval_needed' notifications (notifications INSERT is
-- already open to authenticated).
create or replace function public.calendar_approver_ids()
returns table(user_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select id from public.users where role = 'super_admin'
  union
  select up.user_id from public.user_permissions up where up.permission = 'calendar:write'
$$;

grant execute on function public.calendar_approver_ids() to authenticated;
