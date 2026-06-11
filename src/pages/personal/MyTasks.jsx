import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMyTasks } from '../../lib/tasks'
import { isTaskCompleted } from '../../lib/taskStatuses'
import TaskModal from '../../modules/tasks/TaskModal'
import PersonalTaskList from '../../modules/tasks/PersonalTaskList'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const PRIORITY_STYLES = {
  urgent: { bg: '#FDECEC', text: '#A32D2D' },
  high:   { bg: '#FEF3E2', text: '#9B5500' },
  medium: { bg: '#E6F0FB', text: '#185FA5' },
  low:    { bg: '#F1F0F8', text: '#6B6894' },
}

function startOfDay(d) {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function bucketTasks(tasks) {
  const now = startOfDay(new Date())
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const buckets = { overdue: [], today: [], thisWeek: [], upcoming: [], noDue: [] }

  for (const task of tasks) {
    if (!task.due_date) { buckets.noDue.push(task); continue }
    const due = startOfDay(new Date(task.due_date))
    if (due < now)           buckets.overdue.push(task)
    else if (due < tomorrow) buckets.today.push(task)
    else if (due < weekEnd)  buckets.thisWeek.push(task)
    else                     buckets.upcoming.push(task)
  }

  return buckets
}

function DeptBadge({ dept }) {
  if (!dept) return null
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
        background: `#${dept.color}22`, color: `#${dept.color}`,
        border: `1px solid #${dept.color}44`,
      }}
    >
      {dept.name}
    </span>
  )
}

function TaskRow({ task, onClick }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date()
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'white',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
    >
      <span
        style={{
          flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {task.title}
      </span>

      <DeptBadge dept={task.department} />

      <span
        style={{
          fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
          background: priority.bg, color: priority.text, flexShrink: 0,
        }}
      >
        {task.priority}
      </span>

      {task.due_date && (
        <span
          style={{
            fontSize: 11, flexShrink: 0,
            color: isOverdue ? '#A32D2D' : 'var(--text-tertiary)',
            fontWeight: isOverdue ? 500 : 400,
          }}
        >
          {isOverdue ? '⚠ ' : ''}
          {new Date(task.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  )
}

function Section({ title, tasks, color, onTaskClick, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 0', marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, color: open ? 'var(--accent)' : 'var(--text-tertiary)' }}>
          {open ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: color ?? 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </span>
        <span
          style={{
            minWidth: 20, height: 18, borderRadius: 20, padding: '0 6px',
            background: 'var(--surface-secondary)',
            fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {tasks.length}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MyTasks() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    try {
      const data = await getMyTasks(profile.id)
      setTasks(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profile?.id])

  function handleSaved(saved) {
    setTasks((prev) =>
      prev.some((t) => t.id === saved.id)
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [saved, ...prev],
    )
  }

  function handleDeleted(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const buckets = bucketTasks(tasks)

  return (
    <>
      <div className="space-y-0" style={{ maxWidth: 800 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              My Tasks
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
              Tasks assigned to you across all departments
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner label="Loading tasks" />
          </div>
        ) : (
          <>
            <Section
              title="Overdue"
              tasks={buckets.overdue}
              color="#A32D2D"
              onTaskClick={(t) => setModal({ mode: 'edit', task: t })}
            />
            <Section
              title="Due today"
              tasks={buckets.today}
              color="#9B5500"
              onTaskClick={(t) => setModal({ mode: 'edit', task: t })}
            />
            <Section
              title="This week"
              tasks={buckets.thisWeek}
              onTaskClick={(t) => setModal({ mode: 'edit', task: t })}
            />
            <Section
              title="Upcoming"
              tasks={buckets.upcoming}
              defaultOpen={false}
              onTaskClick={(t) => setModal({ mode: 'edit', task: t })}
            />
            <Section
              title="No due date"
              tasks={buckets.noDue}
              defaultOpen={false}
              onTaskClick={(t) => setModal({ mode: 'edit', task: t })}
            />

            {tasks.length === 0 && (
              <div
                style={{
                  padding: '48px', textAlign: 'center',
                  border: '1px dashed var(--border)', borderRadius: 12,
                  background: 'white',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  You're all caught up
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  No open tasks assigned to you across any department
                </div>
              </div>
            )}
          </>
        )}

        {/* Divider + Personal tasks */}
        <div style={{ marginTop: 32 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span
              style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0,
              }}
            >
              Private tasks
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />

            <button
              type="button"
              onClick={() => setModal({ mode: 'create', isPersonal: true })}
              style={{
                fontSize: 12, fontWeight: 500, padding: '5px 12px',
                background: 'var(--accent-light)', color: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 8, cursor: 'pointer',
              }}
            >
              + Personal task
            </button>
          </div>

          <PersonalTaskList />
        </div>
      </div>

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isPersonal={modal.isPersonal ?? false}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}
