import { useMemo, useState } from 'react'
import { getTaskStatusColor, getTaskStatusLabel, isTaskCompleted } from '../../lib/taskStatuses'

const PRIORITY_STYLES = {
  urgent: { bg: '#FDECEC', text: '#A32D2D' },
  high:   { bg: '#FEF3E2', text: '#9B5500' },
  medium: { bg: '#E6F0FB', text: '#185FA5' },
  low:    { bg: '#F1F0F8', text: '#6B6894' },
}

const SOURCE_LABELS = {
  manual:          '-',
  meeting:         'Meeting',
  automation:      'Auto',
  admin_processor: 'Admin',
  zoom:            'Zoom',
}

function Badge({ bg, text, children }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px', borderRadius: 20,
        fontSize: 11, fontWeight: 500,
        background: bg, color: text,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function SortIcon({ dir }) {
  if (!dir) return <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>⇅</span>
  return <span style={{ color: 'var(--accent)', fontSize: 10 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

function Initials({ name }) {
  const initials = (name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%',
        background: 'var(--accent-light)', color: 'var(--accent)',
        fontSize: 9, fontWeight: 600, flexShrink: 0,
      }}
    >
      {initials || '?'}
    </span>
  )
}

const COLUMNS = [
  { key: 'title',    label: 'Title',    width: '40%' },
  { key: 'assignee', label: 'Assignee', width: '15%', sortKey: null },
  { key: 'priority', label: 'Priority', width: '12%' },
  { key: 'due_date', label: 'Due',      width: '13%' },
  { key: 'status',   label: 'Status',   width: '13%' },
  { key: 'source',   label: 'Source',   width: '7%',  sortKey: null },
]

export default function TaskListView({ tasks, onTaskClick, onAddTask }) {
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (!key) return
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let av = a[sortKey] ?? ''
      let bv = b[sortKey] ?? ''

      if (sortKey === 'due_date') {
        av = av ? new Date(av).getTime() : Infinity
        bv = bv ? new Date(bv).getTime() : Infinity
      } else if (sortKey === 'status') {
        av = getTaskStatusLabel(a).toLowerCase()
        bv = getTaskStatusLabel(b).toLowerCase()
      } else if (sortKey === 'priority') {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 }
        av = order[av] ?? 9
        bv = order[bv] ?? 9
      } else {
        av = String(av).toLowerCase()
        bv = String(bv).toLowerCase()
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [tasks, sortKey, sortDir])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table
          style={{
            width: '100%', borderCollapse: 'collapse',
            tableLayout: 'fixed', fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              {COLUMNS.map((col) => {
                const sk = col.sortKey !== null ? (col.sortKey ?? col.key) : null
                return (
                  <th
                    key={col.key}
                    style={{
                      width: col.width, padding: '8px 12px',
                      textAlign: 'left', fontSize: 11,
                      fontWeight: 600, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
                      cursor: sk ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={() => handleSort(sk)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {col.label}
                      {sk && <SortIcon dir={sortKey === sk ? sortDir : null} />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const isOverdue =
                task.due_date && new Date(task.due_date) < new Date() && !isTaskCompleted(task)

              return (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Title */}
                  <td style={{ padding: '10px 12px', overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500,
                        textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                        opacity: isTaskCompleted(task) ? 0.55 : 1,
                      }}
                      title={task.title}
                    >
                      {task.title}
                    </span>
                  </td>

                  {/* Assignee */}
                  <td style={{ padding: '10px 12px' }}>
                    {task.assignee ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Initials name={task.assignee.name} />
                        <span
                          style={{
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12,
                          }}
                        >
                          {task.assignee.name}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Priority */}
                  <td style={{ padding: '10px 12px' }}>
                    <Badge {...(PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium)}>
                      {task.priority}
                    </Badge>
                  </td>

                  {/* Due date */}
                  <td style={{ padding: '10px 12px' }}>
                    {task.due_date ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: isOverdue ? '#A32D2D' : 'var(--text-secondary)',
                          fontWeight: isOverdue ? 500 : 400,
                        }}
                      >
                        {isOverdue ? '⚠ ' : ''}
                        {new Date(task.due_date).toLocaleDateString('en-CA', {
                          month: 'short', day: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '10px 12px' }}>
                    <Badge bg={`${getTaskStatusColor(task)}22`} text={getTaskStatusColor(task)}>
                      {getTaskStatusLabel(task)}
                    </Badge>
                  </td>

                  {/* Source */}
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {SOURCE_LABELS[task.source] ?? task.source}
                    </span>
                  </td>
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}
                >
                  No tasks match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      {onAddTask ? (
        <button
          type="button"
          onClick={onAddTask}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', fontSize: 13,
            color: 'var(--text-tertiary)', background: 'transparent',
            border: 'none', borderTop: '1px solid var(--border)',
            cursor: 'pointer', width: '100%', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-secondary)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          + New task
        </button>
      ) : null}
    </div>
  )
}
