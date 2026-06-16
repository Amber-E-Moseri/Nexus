import { useMemo, useState } from 'react'
import { formatDueDate } from '../../lib/dateUtils'
import { isTaskCompleted } from '../../lib/taskStatuses'
import { PRIORITY_STYLES } from '../../lib/priorities'
import InlineTaskComposer from './InlineTaskComposer'

function Badge({ bg, text, children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color: text,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Initials({ name }) {
  const initials = (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--accent-light)',
        color: 'var(--accent)',
        fontSize: 9,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </span>
  )
}

function taskMatchesStatus(task, status) {
  return task.status_id === status.id || (!task.status_id && task.status === status.legacy_key)
}

export default function TaskListView({
  tasks,
  statuses = [],
  onTaskClick,
  canAddTask = false,
  departments = [],
  defaultDepartmentId = '',
  onCreateTask,
}) {
  const [composerStatusId, setComposerStatusId] = useState(null)

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)),
    [tasks],
  )

  const grouped = useMemo(() => {
    const matchedIds = new Set()
    const groups = statuses.map((status) => {
      const items = sorted.filter((task) => taskMatchesStatus(task, status))
      items.forEach((task) => matchedIds.add(task.id))
      return { status, items }
    })

    const ungrouped = sorted.filter((task) => !matchedIds.has(task.id))
    if (ungrouped.length > 0) {
      groups.push({
        status: { id: 'ungrouped', name: 'Other', color: '#7A7D86', legacy_key: 'other' },
        items: ungrouped,
      })
    }

    return groups
  }, [sorted, statuses])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {grouped.map(({ status, items }) => (
        <section key={status.id} style={{ border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', background: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#FCFAF6' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              {status.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)' }}>{items.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((task) => {
              const due = formatDueDate(task.due_date)
              const dueColor = due.status === 'overdue'
                ? 'var(--coral-dark)'
                : due.status === 'today'
                  ? 'var(--accent)'
                  : due.status === 'soon'
                    ? 'var(--amber)'
                    : 'var(--text-secondary)'

              return (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  type="button"
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: '#FFFFFF',
                    padding: '14px 16px',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--surface-secondary)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = '#FFFFFF' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
                      {(task.department?.name ?? 'Task').toUpperCase()}
                    </span>
                    <Badge {...(PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium)}>
                      {task.priority}
                    </Badge>
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                      opacity: isTaskCompleted(task) ? 0.55 : 1,
                    }}
                  >
                    {task.title}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    {task.assignee ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Initials name={task.assignee.name} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{task.assignee.name}</span>
                      </span>
                    ) : null}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>□ {task.subtasks?.filter((subtask) => isTaskCompleted(subtask)).length ?? 0}/{task.subtasks?.length ?? 0}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>💬 {task.comments?.[0]?.count ?? 0}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: task.due_date ? dueColor : 'var(--text-tertiary)', fontWeight: due.status === 'normal' ? 400 : 500 }}>
                      {task.due_date ? due.label : 'No due date'}
                    </span>
                  </div>
                </button>
              )
            })}

            {canAddTask ? (
              composerStatusId === status.id ? (
                <div style={{ padding: 16, borderTop: items.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <InlineTaskComposer
                    key={status.id}
                    compact
                    departments={departments}
                    defaultDepartmentId={defaultDepartmentId}
                    onCancel={() => setComposerStatusId(null)}
                    onSubmit={async (draft) => {
                      await onCreateTask?.({
                        ...draft,
                        statusId: status.id,
                      })
                      setComposerStatusId(null)
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposerStatusId(status.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    fontSize: 13,
                    color: 'var(--text-tertiary)',
                    background: 'transparent',
                    border: 'none',
                    borderTop: items.length > 0 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  + Add task
                </button>
              )
            ) : null}
          </div>
        </section>
      ))}

      {grouped.every((group) => group.items.length === 0) ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No tasks match the current filters.
        </div>
      ) : null}
    </div>
  )
}
