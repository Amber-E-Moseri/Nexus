import Badge from '../../../components/ui/Badge'

export const EVENT_COLORS = {
  conference: '#7C3AED',
  program: '#2563EB',
  training: '#D97706',
  prayer: '#059669',
  graduation: '#DB2777',
  event: '#4C2A92',
  deadline: '#DC2626',
}

function formatEventTime(event) {
  const start = new Date(event.start_date)
  if (event.all_day) {
    return start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  }
  return start.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CalendarEventChip({ event, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(event)}
      className="flex w-full items-center gap-2 overflow-hidden rounded-lg bg-white/90 px-2 py-1 text-left text-[11px] text-[var(--text-primary)]"
      style={{ borderLeft: `3px solid ${EVENT_COLORS[event.event_type] ?? EVENT_COLORS.event}` }}
      title={event.title}
    >
      {event.recurrence_rule && <span style={{ fontSize: '10px' }}>🔁</span>}
      <span className="truncate">{event.title}</span>
    </button>
  )
}

export default function CalendarEventCard({ event, canEdit, onEdit, onDelete }) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{event.title}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">{formatEventTime(event)}</div>
        </div>
        <Badge tone={event.event_type === 'deadline' ? 'blocked' : event.event_type === 'prayer' ? 'review' : event.event_type === 'training' ? 'active' : 'completed'}>
          {event.event_type}
        </Badge>
      </div>

      {event.location ? <div className="mt-3 text-sm text-[var(--text-secondary)]">{event.location}</div> : null}
      {event.description ? <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{event.description}</div> : null}
      {event.space_id || event.sprint_id ? (
        <div className="mt-3 text-xs text-[var(--text-tertiary)]">
          {event.space_id ? 'Linked to department' : ''}
          {event.space_id && event.sprint_id ? ' · ' : ''}
          {event.sprint_id ? 'Linked to sprint' : ''}
        </div>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => onEdit?.(event)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
            Edit
          </button>
          <button type="button" onClick={() => onDelete?.(event)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
