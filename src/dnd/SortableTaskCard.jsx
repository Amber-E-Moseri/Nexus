import { memo, useEffect, useMemo, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageSquare, SquareCheckBig } from 'lucide-react'
import { TaskDragHandle } from '@/dnd/TaskDragHandle.jsx'
import { formatDueDate } from '@/lib/dateUtils'
import { PRIORITY_STYLES } from '@/lib/priorities'

function stopPropagation(event) {
  event.stopPropagation()
}

function PriorityPill({ priority, priorities }) {
  if (!priority) return null

  const tone = priorities?.[priority] ?? PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium

  return (
    <span
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.text,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
      }}
    >
      {priority}
    </span>
  )
}

function AssigneeAvatar({ person }) {
  if (!person) return null

  return (
    <div
      title={person.initials}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: person.bg ?? 'var(--accent)',
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {person.initials || '?'}
    </div>
  )
}

function MetaChip({ icon: Icon, value }) {
  if (!value) return null

  return (
    <span
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9E9488' }}
    >
      <Icon size={12} />
      {value}
    </span>
  )
}

function getStatusColor(task, statuses) {
  return statuses?.find((status) => status.id === task.status_id)?.color
    ?? task.status_definition?.color
    ?? task.status_color
    ?? task.statusColor
    ?? '#7A7D86'
}

function getListLabel(task) {
  return task.list?.name
    ?? task.list_name
    ?? task.list?.folder?.name
    ?? task.status_definition?.name
    ?? task.status
    ?? 'Task'
}

function getAssignee(task, people) {
  if (!task.assignee_id) return null
  return people?.[task.assignee_id] ?? null
}

function SortableTaskCardComponent({
  task,
  people = {},
  statuses = [],
  priorities = PRIORITY_STYLES,
  onClick,
  isMobile = false,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const hasDraggedRef = useRef(false)
  const due = formatDueDate(task.due_date)
  const assignee = useMemo(() => getAssignee(task, people), [people, task])
  const statusColor = getStatusColor(task, statuses)
  const listLabel = getListLabel(task).toUpperCase()
  const subtaskCount = (Array.isArray(task.subtask_count) ? task.subtask_count[0]?.count : task.subtask_count) ?? task.subtasks?.length ?? 0
  const commentCount = task.comment_count ?? task.comments?.[0]?.count ?? task.comments?.length ?? 0

  useEffect(() => {
    if (isDragging) hasDraggedRef.current = true
  }, [isDragging])

  function handlePointerDown() {
    hasDraggedRef.current = false
  }

  function handleCardClick() {
    // Acceptance 5/6: a tap or click opens the task unless the pointer crossed the drag threshold.
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }
    onClick?.(task)
  }

  const rootProps = isMobile
    ? {}
    : {
        ...attributes,
        ...listeners,
        onPointerDown: handlePointerDown,
      }

  const handleProps = isMobile
    ? {
        attributes,
        listeners: {
          ...listeners,
          onPointerDown: (event) => {
            handlePointerDown()
            listeners?.onPointerDown?.(event)
          },
        },
      }
    : {}

  return (
    <div
      ref={setNodeRef}
      {...rootProps}
      onClick={handleCardClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        background: '#fff',
        border: isDragging ? '1.5px dashed #C9C0B0' : '1px solid #E9E4D8',
        borderLeft: `3px solid ${statusColor}`,
        borderRadius: 10,
        boxShadow: isDragging ? 'none' : '0 1px 3px rgba(28,22,16,.05)',
        padding: '11px 12px 10px',
        cursor: isMobile ? 'default' : 'grab',
        userSelect: 'none',
      }}
    >
      {isMobile ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <TaskDragHandle {...handleProps} />
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#7A6F5E',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {listLabel}
        </span>
        <span style={{ flex: 1 }} />
        <PriorityPill priority={task.priority} priorities={priorities} />
        {!isMobile ? <TaskDragHandle {...handleProps} /> : null}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1610', lineHeight: 1.35, marginBottom: 10 }}>
        {task.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {assignee ? <AssigneeAvatar person={assignee} /> : null}
        <span style={{ flex: 1 }} />
        <MetaChip icon={SquareCheckBig} value={subtaskCount > 0 ? subtaskCount : null} />
        <MetaChip icon={MessageSquare} value={commentCount > 0 ? commentCount : null} />
        {task.due_date ? (
          <span
            onClick={stopPropagation}
            onPointerDown={stopPropagation}
            style={{ fontSize: 11, color: due.label ? '#9E9488' : '#9E9488', whiteSpace: 'nowrap' }}
          >
            {due.label}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const SortableTaskCard = memo(SortableTaskCardComponent)

export default SortableTaskCard
