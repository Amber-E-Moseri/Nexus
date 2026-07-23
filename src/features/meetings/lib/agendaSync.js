import { createAgenda, updateAgenda, updateAgendaItems } from '../../agendas/lib/agendas'

// Persists a lightweight agenda-items list against a meeting. If the
// meeting already has a linked `agendas` row (agendas(id, ...)), just
// replaces its items. Otherwise creates one (deriving the required
// agendas-table fields from the meeting itself) and links it via
// meeting_id — same underlying tables the standalone /meetings/wizard
// flow uses, just reached from a different entry point.
// Returns { agendaId, items } (items carry real agenda_items ids) so the
// caller can update its own local state directly, without a full re-fetch.
export async function saveAgendaItemsForMeeting(meeting, items, createdBy) {
  const existingAgendaId = meeting?.agendas?.[0]?.id
  if (existingAgendaId) {
    const savedItems = await updateAgendaItems(existingAgendaId, items)
    return { agendaId: existingAgendaId, items: savedItems }
  }

  const date = new Date(meeting.date || Date.now())
  const dateStr = date.toISOString().slice(0, 10)
  const startTime = date.toTimeString().slice(0, 5)
  const endDate = new Date(date.getTime() + 60 * 60 * 1000)
  const endTime = endDate.toTimeString().slice(0, 5)

  const agenda = await createAgenda(
    {
      title: meeting.title || 'Meeting agenda',
      meetingType: meeting.meeting_type || 'general',
      departmentId: meeting.department_id || null,
      date: dateStr,
      startTime,
      endTime,
      // agendas.theme is NOT NULL with a DB-side default of 'cream_purple',
      // but a caller that omits the key entirely still depends on that
      // default actually being live on this environment — pass it
      // explicitly rather than relying on it (same class of migration-
      // history/live-schema drift already hit once this session).
      theme: 'cream_purple',
      createdBy,
    },
    items,
  )
  await updateAgenda(agenda.id, { meeting_id: meeting.id })
  return { agendaId: agenda.id, items: agenda.agenda_items ?? [] }
}
