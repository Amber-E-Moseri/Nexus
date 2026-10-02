const EVENT_TYPE_LABELS = {
  conference: 'Conference',
  program: 'Program',
  training: 'Training',
  prayer: 'Prayer',
  graduation: 'Graduation',
  event: 'Event',
  deadline: 'Deadline',
  leave: 'Leave',
  regional_program: 'Regional Program',
  executive_birthday: 'Birthday',
}

export const EVENT_COLORS = {
  conference: '#7C3AED',
  program: '#2563EB',
  training: '#D97706',
  prayer: '#059669',
  graduation: '#DB2777',
  event: '#4C2A92',
  deadline: '#DC2626',
  leave: '#6B7280',
  regional_program: '#A855F7',
  executive_birthday: '#F59E0B',
}

function eventColor(event) {
  return event.color ?? EVENT_COLORS[event.event_type] ?? EVENT_COLORS.event
}

function formatTime(dateStr) {
  const d = new Date(dateStr)
  const h = d.getHours()
  const m = d.getMinutes()
  if (m === 0) return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  const mm = String(m).padStart(2, '0')
  return h === 0 ? `12:${mm}am` : h < 12 ? `${h}:${mm}am` : h === 12 ? `12:${mm}pm` : `${h - 12}:${mm}pm`
}

function formatDateRange(event) {
  const start = new Date(event.start_date)
  const end = event.end_date ? new Date(event.end_date) : null
  const sameDate = end && start.toDateString() === end.toDateString()

  if (event.all_day) {
    if (!end || sameDate) return start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    return `${start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
  }

  const startStr = `${start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · ${formatTime(event.start_date)}`
  if (!end) return startStr
  if (sameDate) return `${startStr} – ${formatTime(event.end_date)}`
  return `${startStr} → ${end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · ${formatTime(event.end_date)}`
}

export function CalendarEventChip({ event, onClick }) {
  const color = eventColor(event)
  const showTime = !event.all_day && event.start_date
  return (
    <button
      type="button"
      onClick={() => onClick?.(event)}
      className="flex w-full items-center gap-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs transition-colors hover:opacity-80"
      style={{ background: color, color: 'white' }}
      title={event.title}
    >
      {event.recurrence_rule && <span style={{ fontSize: '11px', flexShrink: 0 }}>🔁</span>}
      {showTime && (
        <span style={{ fontWeight: 700, flexShrink: 0, fontSize: '11px' }}>
          {formatTime(event.start_date)}
        </span>
      )}
      <span className="line-clamp-1 font-bold text-xs">{event.title}</span>
    </button>
  )
}

export default function CalendarEventCard({ event, canEdit, onEdit, onDelete }) {
  const color = eventColor(event)
  return (
    <div
      className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: `${color}20`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
                display: 'block',
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{event.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{formatDateRange(event)}</div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              background: `${color}18`,
              borderRadius: 6,
              padding: '2px 7px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
          </span>
        </div>

        {event.location ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {event.location}
          </div>
        ) : null}
        {event.description ? (
          <div className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{event.description}</div>
        ) : null}
        {event.space_id || event.sprint_id ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            {event.space_id ? (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Department
              </span>
            ) : null}
            {event.space_id && event.sprint_id ? <span>·</span> : null}
            {event.sprint_id ? (
              <span className="flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Sprint
              </span>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onEdit?.(event)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(event)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-red-300 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
