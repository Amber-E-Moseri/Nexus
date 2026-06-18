import { memo, useEffect, useMemo, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { TaskDragHandle } from '@/dnd/TaskDragHandle.jsx'
import { formatDueDate } from '@/lib/dateUtils'
import { PRIORITY_STYLES } from '@/lib/priorities'

function stopPropagation(event) {
  event.stopPropagation()
}

function PriorityBadge({ priority, priorities }) {
  if (!priority) return <span style={{ fontSize: 12, color: '#B0A696' }}>-</span>

  const tone = priorities?.[priority] ?? PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium

  return (
    <span
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: tone.bg,
        color: tone.text,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {priority}
    </span>
  )
}

function AssigneeStack({ task, people }) {
  const assignees = []

  if (task.assignee_id && people?.[task.assignee_id]) assignees.push(people[task.assignee_id])
  if (task.assignee && assignees.length === 0) {
    assignees.push({
      initials: task.assignee.name
        ?.split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '?',
      bg: 'var(--accent)',
      name: task.assignee.name,
    })
  }

  if (assignees.length === 0) return <span style={{ fontSize: 12, color: '#B0A696' }}>-</span>

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
      {assignees.slice(0, 3).map((person, index) => (
        <div
          key={`${person.initials}-${index}`}
          title={person.name ?? person.initials}
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
            marginLeft: index === 0 ? 0 : -6,
            border: '1.5px solid #FFFFFF',
            flexShrink: 0,
          }}
        >
          {person.initials || '?'}
        </div>
      ))}
    </div>
  )
}

function DueText({ task }) {
  if (!task.due_date) return <span style={{ fontSize: 12, color: '#B0A696' }}>-</span>

  const due = formatDueDate(task.due_date)
  const color = due.status === 'overdue'
    ? '#C94830'
    : due.status === 'today'
      ? '#4C2A92'
      : due.status === 'soon'
        ? '#B26A00'
        : '#7A6F5E'

  return (
    <span
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      style={{ fontSize: 12, color, whiteSpace: 'nowrap', fontWeight: due.status === 'normal' ? 400 : 600 }}
    >
      {due.label}
    </span>
  )
}

function RowContent({
  task,
  people,
  priorities,
  handleProps,
  isOver = false,
  isHovering = false,
  isMobile = false,
}) {
  const subtaskCount = task.subtask_count ?? task.subtasks?.length ?? 0

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: isMobile ? '40px 1fr' : '40px minmax(0,1fr) 110px 96px 90px 70px',
        alignItems: 'center',
        minHeight: 44,
        padding: '11px 16px 11px 0',
        borderBottom: '1px solid #F2EEE6',
        background: isHovering ? '#F9F7F3' : '#FFFFFF',
      }}
    >
      {isOver ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 16,
            right: 16,
            height: 2,
            background: '#4C2A92',
            borderRadius: 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>
        {isMobile ? (
          <TaskDragHandle {...handleProps} />
        ) : (
          <button
            type="button"
            {...handleProps}
            onClick={stopPropagation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              minWidth: 40,
              border: 'none',
              background: 'transparent',
              color: '#B0A696',
              cursor: 'grab',
              touchAction: 'none',
              borderRadius: 6,
            }}
            aria-label="Drag to reorder"
          >
            <GripVertical size={15} />
          </button>
        )}
      </div>

      <div style={{ minWidth: 0, paddingRight: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1C1610',
            lineHeight: 1.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </div>
      </div>

      {!isMobile ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <AssigneeStack task={task} people={people} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
            <PriorityBadge priority={task.priority} priorities={priorities} />
          </div>
          <div style={{ minWidth: 0 }}>
            <DueText task={task} />
          </div>
          <div style={{ fontSize: 12, color: '#7A6F5E', textAlign: 'right' }}>
            {subtaskCount || '-'}
          </div>
        </>
      ) : null}
    </div>
  )
}

function SortableTaskRowComponent({
  task,
  people = {},
  statuses = [],
  priorities = PRIORITY_STYLES,
  onClick,
  isMobile = false,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: task.id })
  const hasDraggedRef = useRef(false)
  const [statusColor] = useMemo(() => [
    statuses?.find((status) => status.id === task.status_id || status.key === task.status || status.legacy_key === task.status)?.color ?? '#7A7D86',
  ], [statuses, task.status_id, task.status])

  useEffect(() => {
    if (isDragging) hasDraggedRef.current = true
  }, [isDragging])

  function handlePointerDown() {
    hasDraggedRef.current = false
  }

  function handleClick() {
    // Acceptance 7/8: taps open the row unless a real drag crossed the sensor threshold.
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
    : {
        ...attributes,
        ...listeners,
        onPointerDown: (event) => {
          handlePointerDown()
          listeners?.onPointerDown?.(event)
        },
      }

  return (
    <div
      ref={setNodeRef}
      {...rootProps}
      onClick={handleClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        cursor: 'pointer',
        borderLeft: `2px solid ${statusColor}`,
      }}
      onMouseEnter={(event) => {
        const row = event.currentTarget.firstChild
        if (row) row.style.background = '#F9F7F3'
      }}
      onMouseLeave={(event) => {
        const row = event.currentTarget.firstChild
        if (row) row.style.background = '#FFFFFF'
      }}
    >
      <RowContent
        task={task}
        people={people}
        priorities={priorities}
        handleProps={handleProps}
        isOver={isOver}
        isMobile={isMobile}
      />
    </div>
  )
}

export function TaskRowGhost({ task, people = {}, priorities = PRIORITY_STYLES, isMobile = false }) {
  return (
    <div
      style={{
        boxShadow: '0 16px 40px rgba(28,22,16,.18)',
        transform: 'rotate(1.2deg)',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#FFFFFF',
        minWidth: isMobile ? 260 : 620,
      }}
    >
      <RowContent
        task={task}
        people={people}
        priorities={priorities}
        handleProps={{}}
        isMobile={isMobile}
      />
    </div>
  )
}

const SortableTaskRow = memo(SortableTaskRowComponent)

export default SortableTaskRow
