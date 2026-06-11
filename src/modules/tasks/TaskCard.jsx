import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isTaskCompleted } from '../../lib/taskStatuses'

const PRIORITY_STYLES = {
  urgent: { bg: '#FDECEC', text: '#A32D2D' },
  high: { bg: '#FEF3E2', text: '#9B5500' },
  medium: { bg: '#E6F0FB', text: '#185FA5' },
  low: { bg: '#F1F0F8', text: '#6B6894' },
}

const SOURCE_LABELS = {
  meeting: 'Meeting',
  automation: 'Auto',
  admin_processor: 'Admin',
  zoom: 'Zoom',
}

function Initials({ name }) {
  const initials = (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'var(--accent-light)',
        color: 'var(--accent)',
        fontSize: 9,
        fontWeight: 600,
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

export default function TaskCard({ task, onClick, isDragging = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: task.id })

  const isOverdue =
    task.due_date && new Date(task.due_date) < new Date() && !isTaskCompleted(task)

  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium
  const doneCount = task.subtasks?.filter((subtask) => isTaskCompleted(subtask)).length ?? 0
  const totalSubtasks = task.subtasks?.length ?? 0
  const commentCount = task.comments?.[0]?.count ?? 0
  const fileCount = task.files?.[0]?.count ?? 0
  const dependencyCount = task.dependencies?.[0]?.count ?? 0

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
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        boxShadow: isDragging
          ? '0 8px 24px rgba(20,20,43,0.14)'
          : '0 1px 3px rgba(20,20,43,0.04)',
      }}
    >
      {task.source && task.source !== 'manual' && (
        <div style={{ marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 20,
              background: '#F1F0F8',
              color: '#6B6894',
            }}
          >
            {SOURCE_LABELS[task.source] ?? task.source}
          </span>
        </div>
      )}

      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 8,
          lineHeight: 1.45,
          textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
          opacity: isTaskCompleted(task) ? 0.6 : 1,
        }}
      >
        {task.title}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 7px',
            borderRadius: 20,
            background: priority.bg,
            color: priority.text,
          }}
        >
          {task.priority}
        </span>

        {totalSubtasks > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            ⊞ {doneCount}/{totalSubtasks}
          </span>
        )}

        {commentCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            💬 {commentCount}
          </span>
        )}

        {fileCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            📎 {fileCount}
          </span>
        )}

        {dependencyCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            ⛓ {dependencyCount}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.due_date && (
            <span
              style={{
              fontSize: 11,
              color: isOverdue ? '#A32D2D' : 'var(--text-tertiary)',
              fontWeight: isOverdue ? 500 : 400,
            }}
          >
              {isOverdue ? '⚠ ' : ''}
              {new Date(task.due_date).toLocaleDateString('en-CA', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}

          {task.assignee && <Initials name={task.assignee.name} />}
        </div>
      </div>
    </div>
  )
}
