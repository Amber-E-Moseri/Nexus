-- Extend activity_log RLS to expose ICPLC participant audit events.
-- The entity_type filter is required — without it, any ICPLC team member could
-- read activity_log rows belonging to other parts of the system.

create policy "activity_log_icplc_participant"
  on public.activity_log for select to authenticated
  using (
    entity_type = 'icplc_participant'
    and public.icplc_can_read_participants()
  );
