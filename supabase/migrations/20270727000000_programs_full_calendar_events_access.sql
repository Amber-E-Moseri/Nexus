-- Extend Programs team's Ministry Calendar access from settings-only
-- (connection/sources/visibility/event-types, granted in
-- 20270724000203_ministry_calendar_regsec_programs_access.sql) to the
-- actual calendar_events table: viewing all events (including pending/
-- unapproved), approving/updating, and deleting. Previously gated only on
-- super_admin or an explicit per-user calendar_permissions.can_manage row
-- — Programs team membership alone didn't grant any of this, same class
-- of gap as the settings tables had before that migration.
--
-- Reuses can_manage_ministry_calendar() (super_admin OR regional_secretary
-- OR is_programs_team()) so this stays in sync with the settings-side
-- grant instead of drifting.

drop policy if exists calendar_events_view_all_for_managers on public.calendar_events;
create policy calendar_events_view_all_for_managers on public.calendar_events
  for select
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or exists (
      select 1 from calendar_permissions
      where calendar_permissions.user_id = auth.uid()
        and calendar_permissions.can_manage = true
    )
    or public.can_manage_ministry_calendar()
  );

drop policy if exists calendar_events_update_managers on public.calendar_events;
create policy calendar_events_update_managers on public.calendar_events
  for update
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or exists (
      select 1 from calendar_permissions
      where calendar_permissions.user_id = auth.uid()
        and calendar_permissions.can_manage = true
    )
    or public.can_manage_ministry_calendar()
  );

drop policy if exists calendar_events_delete_admin on public.calendar_events;
create policy calendar_events_delete_admin on public.calendar_events
  for delete
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or public.can_manage_ministry_calendar()
  );
