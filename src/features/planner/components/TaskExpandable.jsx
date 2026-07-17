import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BORDER, MUTED, PRIORITY_DOT, TEXT, spaceColor, BG } from '../lib/plannerTheme'
import { parseTimeToMinutes, formatTimeRange, fromISODate } from '../lib/timeBlockUtils'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function scheduleBadgeText(blocks) {
  if (!blocks.length) return null
  if (blocks.length === 1) {
    const b = blocks[0]
    // fromISODate uses new Date(y, m-1, d) — local constructor, .getDay() is timezone-safe
    const day = DAY_ABBR[fromISODate(b.scheduled_date).getDay()]
    if (b.is_all_day) return `${day} · All day`
    return `${day} · ${formatTimeRange(b.scheduled_start_time, b.scheduled_end_time)}`
  }
  // Multiple blocks: omit hours when any are all-day (stored 00:00–23:59 = not a useful work estimate)
  const hasAllDay = blocks.some((b) => b.is_all_day)
  if (hasAllDay) return `${blocks.length} blocks`
  const totalMins = blocks.reduce(
    (sum, b) => sum + parseTimeToMinutes(b.scheduled_end_time) - parseTimeToMinutes(b.scheduled_start_time),
    0,
  )
  // Deliberate scope: count+hours only, no per-day info. Users needing session detail can read the grid.
  return `${blocks.length} blocks · ${Math.round((totalMins / 60) * 10) / 10}h`
}

// Sidebar task row: draggable into the grid, expandable to reveal subtasks
// (which are themselves draggable). Subtasks load lazily on first expand.
// On mobile, onTapSchedule replaces drag — tap once to select, tap again to deselect.
export default function TaskExpandable({
  task,
  isSubtask = false,
  subtaskCount = 0,
  expanded = false,
  scheduledBlocks = [],
  onToggleExpand,
  onOpen,
  onTapSchedule,  // mobile only: (task) => void
  isPending = false, // mobile: this task is the selected-to-schedule one
  children,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: 'task', task },
    disabled: !!onTapSchedule, // disable dnd on mobile
  })
  const color = spaceColor(task.space)

  const handleClick = () => {
    if (isDragging) return
    if (onTapSchedule) onTapSchedule(task)
    else onOpen(task)
  }

  return (
    <div style={{ marginBottom: isSubtask ? 4 : 6 }}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...(onTapSchedule ? {} : listeners)}
        onClick={handleClick}
        style={{
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: isPending ? 'var(--accent-light)' : 'white',
          border: `1px solid ${isPending ? 'var(--accent)' : BORDER}`,
          borderRadius: 8,
          padding: isSubtask ? '5px 8px' : '7px 9px',
          marginLeft: isSubtask ? 18 : 0,
          cursor: onTapSchedule ? 'pointer' : 'grab',
          userSelect: 'none',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        {!isSubtask && subtaskCount > 0 && (
          <button
            type="button"
            aria-label={expanded ? 'Collapse subtasks' : `Expand ${subtaskCount} subtasks`}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(task) }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: isSubtask ? 11.5 : 12.5, fontWeight: 500, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.title}
        </span>
        {scheduledBlocks.length > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: '#EEF2FF', borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {scheduleBadgeText(scheduledBlocks)}
          </span>
        )}
        {task.space?.name && !isSubtask && (
          <span style={{ background: `${color}20`, color, fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {task.space.name}
          </span>
        )}
        {!isSubtask && subtaskCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(task) }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${BORDER}`, background: BG, color: MUTED, fontSize: 9.5, fontWeight: 700, borderRadius: 5, padding: '0 5px', cursor: 'pointer', flexShrink: 0 }}
          >
            [{subtaskCount}]
          </button>
        )}
      </div>
      {expanded && children}
    </div>
  )
}
