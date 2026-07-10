import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BORDER, MUTED, PRIORITY_DOT, TEXT, spaceColor, BG } from '../lib/plannerTheme'

// Sidebar task row: draggable into the grid, expandable to reveal subtasks
// (which are themselves draggable). Subtasks load lazily on first expand.
export default function TaskExpandable({
  task,
  isSubtask = false,
  subtaskCount = 0,
  expanded = false,
  scheduled = false,
  onToggleExpand,
  onOpen,
  children,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: 'task', task },
  })
  const color = spaceColor(task.space)

  return (
    <div style={{ marginBottom: isSubtask ? 4 : 6 }}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => { if (!isDragging) onOpen(task) }}
        style={{
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'white',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: isSubtask ? '5px 8px' : '7px 9px',
          marginLeft: isSubtask ? 18 : 0,
          cursor: 'grab',
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
        {scheduled && <span title="Has a time block this week" style={{ fontSize: 9, color: MUTED }}>●</span>}
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
