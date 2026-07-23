import { X } from 'lucide-react'
import { CalendarEventChip } from './CalendarEventCard'

// Lists every event on a day the grid cell couldn't fit (the "+N more" link).
// Clicking a row hands off to the same onEventClick the grid cells use, so it
// opens the normal event detail flow.
export default function DayEventsPopover({ date, events, onClose, onEventClick }) {
  if (!date) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-[var(--text-primary)]">
            {date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-secondary)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {events.map((event) => (
            <CalendarEventChip
              key={event.id}
              event={event}
              onClick={(clicked) => {
                onEventClick?.(clicked)
                onClose()
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
