import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BORDER, MUTED, TEXT, BG } from '../lib/plannerTheme'
import { minutesToTime, parseTimeToMinutes, MINUTES_PER_DAY, canSplitBlock } from '../lib/timeBlockUtils'

const DURATIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
]

// Right-click menu for a time block: duration presets + split + remove-from-schedule
// (with inline confirm — removing the block never deletes the task).
export default function TimeBlockContextMenu({
  x, y, block,
  childBlocksByParentBlockId = {},
  isSplitting = false,
  onSetDuration, onDelete, onSplit, onClose,
}) {
  const ref = useRef(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [menuTop, setMenuTop] = useState(y)

  // Two-pass positioning: first render at y, then measure and clamp so the menu
  // never clips below the viewport bottom. useLayoutEffect runs before paint so
  // the correction is imperceptible.
  useLayoutEffect(() => {
    if (!ref.current) return
    const h = ref.current.offsetHeight
    setMenuTop(Math.min(y, window.innerHeight - h - 8))
  }, [y])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const eligible = canSplitBlock(block, childBlocksByParentBlockId) && !isSplitting
  const splitTitle = isSplitting
    ? 'Splitting…'
    : block.is_all_day
      ? 'Cannot split an all-day block'
      : (childBlocksByParentBlockId[block.id]?.length > 0)
        ? 'Cannot split a block with linked subtask blocks'
        : 'Block must be at least 30 minutes to split'

  const itemStyle = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: '6px 12px',
    fontSize: 12,
    color: TEXT,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        top: menuTop,
        left: Math.min(x, window.innerWidth - 200),
        zIndex: 400,
        background: 'white',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        padding: '6px 0',
        width: 180,
      }}
    >
      {!confirmingDelete ? (
        <>
          <div style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>
            Set duration
          </div>
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              role="menuitem"
              style={itemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = BG }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              onClick={() => {
                const start = parseTimeToMinutes(block.scheduled_start_time)
                onSetDuration(block, minutesToTime(Math.min(MINUTES_PER_DAY, start + d.minutes)))
                onClose()
              }}
            >
              {d.label}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '5px 0' }} />
          <button
            type="button"
            role="menuitem"
            disabled
            title="Google Calendar sync arrives in Phase 2"
            style={{ ...itemStyle, color: MUTED, cursor: 'default' }}
          >
            Sync to calendar
            <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: BG, borderRadius: 4, padding: '1px 5px' }}>SOON</span>
          </button>
          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '5px 0' }} />
          {eligible ? (
            <button
              type="button"
              role="menuitem"
              style={itemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = BG }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              onClick={() => { onSplit(block); onClose() }}
            >
              Split into two sessions
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              title={splitTitle}
              style={{ ...itemStyle, color: MUTED, cursor: 'default' }}
            >
              {isSplitting ? 'Splitting…' : 'Split into two sessions'}
              {!isSplitting && (
                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: BG, borderRadius: 4, padding: '1px 5px' }}>
                  {block.is_all_day ? 'N/A' : '30m min'}
                </span>
              )}
            </button>
          )}
          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '5px 0' }} />
          <button
            type="button"
            role="menuitem"
            style={{ ...itemStyle, color: '#C94830', fontWeight: 600 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FBEAE6' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => setConfirmingDelete(true)}
          >
            Remove from schedule
          </button>
        </>
      ) : (
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 11.5, color: TEXT, marginBottom: 8 }}>
            This will remove the time block. The task stays in your backlog.
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...itemStyle, width: 'auto', padding: '4px 8px', color: MUTED }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onDelete(block); onClose() }}
              style={{ ...itemStyle, width: 'auto', padding: '4px 10px', background: '#C94830', color: '#fff', borderRadius: 6, fontWeight: 700 }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
