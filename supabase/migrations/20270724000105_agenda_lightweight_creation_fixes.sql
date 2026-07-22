-- =============================================================================
-- Fixes for agenda creation via the lightweight editor (WS7, MeetingAgendaEditor
-- + saveAgendaItemsForMeeting), which reaches the same `agendas`/`agenda_items`
-- tables as the standalone /meetings/wizard flow but with different real-world
-- inputs than the wizard was designed around.
-- =============================================================================

-- 1. `agendas.department_id` is NOT NULL, but a meeting isn't guaranteed to
--    have one — 1-on-1 meetings and org-wide meetings both legitimately have
--    department_id = null (see ScheduleMeetingModal.jsx / MeetingModal.jsx).
--    Saving an agenda for either currently 500s on this constraint.
alter table public.agendas
  alter column department_id drop not null;

-- 2. `agendas.theme` is NOT NULL DEFAULT 'cream_purple' per
--    20260729000001_agenda_system.sql — reinforcing the default here too,
--    since the app now also passes it explicitly (belt and suspenders,
--    same drift concern noted in 20270724000100).
alter table public.agendas
  alter column theme set default 'cream_purple';

-- 3. `agendas_insert`'s role check (super_admin/dept_lead/pastor only) made
--    sense when only the standalone template-driven wizard wrote to this
--    table. Now that any meeting editor can attach a lightweight agenda from
--    Schedule/Log meeting or the meeting detail page, that role list blocks
--    most departments' own staff (Admin, Media, PFCC, ORS non-leads) from
--    saving an agenda for a meeting they themselves created — RLS-denied
--    with no role escalation possible. The real access boundary is already
--    "did you create this meeting" (enforced by canManage in the UI and by
--    is_meetings_full_editor elsewhere); agendas.created_by = auth.uid() is
--    the equivalent boundary for this table, matching the existing
--    agendas_update/agendas_delete policies which never had the role gate.
drop policy if exists "agendas_insert" on public.agendas;
create policy "agendas_insert"
  on public.agendas for insert
  to authenticated
  with check (created_by = auth.uid());
