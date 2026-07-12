import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDueDate } from '../../../lib/dateUtils'
import { PRIORITY_STYLES } from '../../../lib/priorities'
import { getTaskStatusLabel, isTaskCompleted } from '../../../lib/taskStatuses'

function Initials({ name }) {
  const initials = (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </div>
  )
}

function OverflowBadge({ count }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#EDE8F8',
        color: '#4C2A92',
        fontSize: 9,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      +{count}
    </div>
  )
}

function TaskCard({ task, onClick, isDragging = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: task.id })

  const due = formatDueDate(task.due_date)
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium
  const statusLabel = getTaskStatusLabel(task)
  const isBlocked = statusLabel === 'Blocked'
  const subtasks = task.subtasks ?? []
  const commentCount = task.comments?.[0]?.count ?? 0
  const parentTitle = task.parent?.title ?? task.parent_task?.title ?? null
  const isFromMeeting = task.source === 'meeting'
  const assignees = Array.isArray(task.assignees)
    ? task.assignees.filter(Boolean)
    : task.assignee
      ? [task.assignee]
      : []
  const visibleAssignees = assignees.slice(0, 3)
  const overflowAssigneeCount = Math.max(0, assignees.length - visibleAssignees.length)
  const scopeLabel = (task.department?.name ?? task.space_name ?? task.list?.folder?.name ?? task.list?.name ?? 'Task').toUpperCase()
  const dueColor = due.status === 'overdue'
    ? 'var(--coral-dark)'
    : due.status === 'today'
      ? 'var(--accent)'
      : due.status === 'soon'
        ? 'var(--amber)'
        : 'var(--text-tertiary)'

  const subtasksDone = subtasks.filter((s) => isTaskCompleted(s)).length
  const subtaskPct = subtasks.length > 0 ? Math.round((subtasksDone / subtasks.length) * 100) : 0
  const subtaskBarColor = subtaskPct >= 100 ? '#2D8653' : subtaskPct > 0 ? '#C47E0A' : '#D5CCBE'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortDragging ? 0.4 : 1,
        background: '#FFFFFF',
        border: '1px solid #E8E0D2',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        boxShadow: isDragging
          ? '0 8px 28px rgba(28,22,16,0.10)'
          : '0 2px 8px rgba(28,22,16,0.06)',
      }}
    >
      <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
          {scopeLabel}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {isFromMeeting && (
            task.meeting_id ? (
              <Link
                to={`/meetings/${task.meeting_id}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                title={task.meeting?.title ? `From meeting: ${task.meeting.title}` : 'Created from a meeting action item'}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: '#EDE8F8',
                  color: '#4C2A92',
                  whiteSpace: 'nowrap',
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textDecoration: 'none',
                }}
              >
                📋 {task.meeting?.title ? `From: ${task.meeting.title}` : 'From Meeting'}
              </Link>
            ) : (
              <span
                title="Created from a meeting action item"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: '#EDE8F8',
                  color: '#4C2A92',
                  whiteSpace: 'nowrap',
                }}
              >
                📋 From Meeting
              </span>
            )
          )}
          {isBlocked && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                background: '#C94830',
                color: '#FFFFFF',
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
              }}
            >
              🚫 Blocked
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: priority.bg,
              color: priority.text,
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
            }}
          >
            {task.priority}
          </span>
        </div>
      </div>

      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 12,
          lineHeight: 1.5,
          textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
          opacity: isTaskCompleted(task) ? 0.6 : 1,
        }}
      >
        {task.title}
      </p>

      {parentTitle ? (
        <p
          title={`Subtask of: ${parentTitle}`}
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginTop: -6,
            marginBottom: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          ↳ Subtask of: {parentTitle}
        </p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {visibleAssignees.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {visibleAssignees.map((assignee, index) => (
              <div key={assignee.id ?? `${assignee.name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -6 }}>
                <Initials name={assignee.name} />
              </div>
            ))}
            {overflowAssigneeCount > 0 ? (
              <div style={{ marginLeft: -6 }}>
                <OverflowBadge count={overflowAssigneeCount} />
              </div>
            ) : null}
          </div>
        ) : null}

        {subtasks.length > 0 ? (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {subtasksDone}/{subtasks.length}
          </span>
        ) : null}

        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden="true">💬</span>
          {commentCount}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.due_date ? (
            <span
              style={{
                fontSize: 11,
                color: dueColor,
                fontWeight: due.status === 'normal' ? 400 : 500,
              }}
            >
              {due.label}
            </span>
          ) : null}
        </div>
      </div>
      </div>

      {subtasks.length > 0 ? (
        <div
          title={`${subtasksDone} of ${subtasks.length} subtasks completed`}
          style={{ height: 4, background: '#EDE8DF' }}
        >
          <div
            style={{
              height: '100%',
              width: `${subtaskPct}%`,
              background: subtaskBarColor,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default memo(TaskCard)
