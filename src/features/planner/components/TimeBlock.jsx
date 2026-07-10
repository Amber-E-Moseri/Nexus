import { useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { HOUR_HEIGHT, PRIORITY_DOT, spaceColor, TEXT } from '../lib/plannerTheme'
import { SEVERITY_COLOR } from '../lib/warningEngine'
import {
  blockDurationMinutes,
  formatTimeRange,
  minutesToTime,
  parseTimeToMinutes,
  snapMinutes,
  MINUTES_PER_DAY,
} from '../lib/timeBlockUtils'

// One scheduled block in the grid. Draggable (reschedule), resizable from the
// bottom edge (duration), right-clickable (context menu), clickable (task modal).
export default function TimeBlock({ block, task, severity, linked, style, onClick, onContextMenu, onResize }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { type: 'block', block },
  })
  const [resizeDelta, setResizeDelta] = useState(null) // live minutes delta while resizing
  const resizeState = useRef(null)

  const duration = blockDurationMinutes(block)
  const previewDuration = resizeDelta === null ? duration : Math.max(15, snapMinutes(duration + resizeDelta))
  const startMin = parseTimeToMinutes(block.scheduled_start_time)
  const heightPx = Math.max(22, (previewDuration / 60) * HOUR_HEIGHT - 2)

  const color = spaceColor(task?.space)
  const borderColor = severity ? SEVERITY_COLOR[severity] : color

  function startResize(e) {
    e.stopPropagation()
    e.preventDefault()
    resizeState.current = { startY: e.clientY }
    setResizeDelta(0)
    const onMove = (ev) => {
      const deltaMin = ((ev.clientY - resizeState.current.startY) / HOUR_HEIGHT) * 60
      setResizeDelta(deltaMin)
    }
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const deltaMin = ((ev.clientY - resizeState.current.startY) / HOUR_HEIGHT) * 60
      const nextDuration = Math.max(15, snapMinutes(duration + deltaMin))
      const nextEnd = Math.min(MINUTES_PER_DAY, startMin + nextDuration)
      setResizeDelta(null)
      resizeState.current = null
      if (nextEnd - startMin !== duration) onResize(block, minutesToTime(nextEnd))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const endPreview = minutesToTime(Math.min(MINUTES_PER_DAY, startMin + previewDuration))

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`${task?.title ?? 'Task'}, ${formatTimeRange(block.scheduled_start_time, block.scheduled_end_time)}`}
      onClick={(e) => {
        e.stopPropagation()
        if (!isDragging && resizeDelta === null) onClick(block)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, block)
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 0.92,
        position: 'absolute',
        boxSizing: 'border-box',
        height: heightPx,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 6,
        padding: '3px 6px',
        cursor: 'grab',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: isDragging ? 60 : 5,
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.boxShadow = '0 2px 8px rgba(28,22,16,.16)' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.92; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_DOT[task?.priority] ?? PRIORITY_DOT.medium, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task?.title ?? '…'}
        </span>
        {linked && <span title="Linked to parent block" style={{ fontSize: 9, flexShrink: 0 }}>🔗</span>}
      </div>
      {previewDuration >= 30 && (
        <div style={{ fontSize: 10, color: '#6B6355', marginTop: 1 }}>
          {formatTimeRange(block.scheduled_start_time, resizeDelta === null ? block.scheduled_end_time : endPreview)}
        </div>
      )}
      {task?.space?.name && previewDuration >= 45 && (
        <span style={{ display: 'inline-block', marginTop: 2, background: `${color}2e`, color, fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>
          {task.space.name}
        </span>
      )}
      {!block.is_all_day && (
        <div
          onPointerDown={startResize}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          title="Drag to resize"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, cursor: 'ns-resize' }}
        />
      )}
    </div>
  )
}
