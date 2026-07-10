import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BORDER, MUTED, PRIMARY, TEXT } from '../lib/plannerTheme'
import { addDays, toISODate, fromISODate, startOfWeek } from '../lib/timeBlockUtils'

function formatRange(weekStart) {
  const end = addDays(weekStart, 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('en-CA', opts)} – ${end.toLocaleDateString('en-CA', opts)}`
}

const navBtn = {
  border: `1px solid ${BORDER}`,
  background: '#fff',
  borderRadius: 8,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: TEXT,
}

// Week navigation and date-picker week jump.
export default function PlannerHeader({ weekStart, onWeekChange }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Planner</h1>
        <div style={{ fontSize: 11, color: MUTED }}>Due dates stay put; schedule when you'll do the work.</div>
      </div>
      <div style={{ flex: 1 }} />
      <button type="button" aria-label="Previous week" style={navBtn} onClick={() => onWeekChange(addDays(weekStart, -7))}>
        <ChevronLeft size={15} />
      </button>
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        style={{ position: 'relative', border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: TEXT, cursor: 'pointer' }}
      >
        {formatRange(weekStart)}
        {pickerOpen && (
          <input
            type="date"
            autoFocus
            aria-label="Jump to week"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) {
                onWeekChange(startOfWeek(fromISODate(e.target.value)))
                setPickerOpen(false)
              }
            }}
            style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 6, background: '#fff', fontFamily: 'inherit' }}
          />
        )}
      </button>
      <button type="button" aria-label="Next week" style={navBtn} onClick={() => onWeekChange(addDays(weekStart, 7))}>
        <ChevronRight size={15} />
      </button>
      <button
        type="button"
        onClick={() => onWeekChange(startOfWeek(new Date()))}
        style={{ border: `1px solid ${PRIMARY}`, background: '#fff', color: PRIMARY, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        Today
      </button>
    </div>
  )
}
