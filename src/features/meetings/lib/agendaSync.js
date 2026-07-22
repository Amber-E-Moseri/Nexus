import { createAgenda, updateAgenda, updateAgendaItems } from '../../agendas/lib/agendas'

// Persists a lightweight agenda-items list against a meeting. If the
// meeting already has a linked `agendas` row (agendas(id, ...)), just
// replaces its items. Otherwise creates one (deriving the required
// agendas-table fields from the meeting itself) and links it via
// meeting_id — same underlying tables the standalone /meetings/wizard
// flow uses, just reached from a different entry point.
// Returns the agenda id (existing or newly created) so the caller can
// update its own local state.
export async function saveAgendaItemsForMeeting(meeting, items, createdBy) {
  const existingAgendaId = meeting?.agendas?.[0]?.id
  if (existingAgendaId) {
    await updateAgendaItems(existingAgendaId, items)
    return existingAgendaId
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
      createdBy,
    },
    items,
  )
  await updateAgenda(agenda.id, { meeting_id: meeting.id })
  return agenda.id
}
