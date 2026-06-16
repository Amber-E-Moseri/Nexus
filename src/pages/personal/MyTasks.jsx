import { useEffect, useMemo, useState } from 'react'
import { endOfWeek, isAfter, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { formatDueDate } from '../../lib/dateUtils'
import { getMyTasks } from '../../lib/tasks'
import { isTaskCompleted } from '../../lib/taskStatuses'
import TaskListView from '../../modules/tasks/TaskListView'
import TaskModal from '../../modules/tasks/TaskModal'

const VIEWS = ['Today', 'This Week', 'Upcoming', 'Overdue', 'All']

function parseDueDate(task) {
  return task.due_date ? parseISO(`${task.due_date}T00:00:00`) : null
}

function filterTasksByView(tasks, view, today, endOfCurrentWeek) {
  return tasks.filter((task) => {
    const due = parseDueDate(task)

    if (view === 'Today') {
      return due ? isEqual(startOfDay(due), today) : false
    }

    if (view === 'This Week') {
      return due ? (!isBefore(startOfDay(due), today) && !isAfter(startOfDay(due), endOfCurrentWeek)) : false
    }

    if (view === 'Upcoming') {
      return !due || isAfter(startOfDay(due), endOfCurrentWeek)
    }

    if (view === 'Overdue') {
      return due ? isBefore(startOfDay(due), today) && !isTaskCompleted(task) : false
    }

    return true
  })
}

function overdueGroups(tasks, today) {
  return {
    '1–3 days': tasks.filter((task) => {
      const due = parseDueDate(task)
      if (!due) return false
      const days = Math.floor((today.getTime() - startOfDay(due).getTime()) / 86400000)
      return days >= 1 && days <= 3
    }),
    '4–7 days': tasks.filter((task) => {
      const due = parseDueDate(task)
      if (!due) return false
      const days = Math.floor((today.getTime() - startOfDay(due).getTime()) / 86400000)
      return days >= 4 && days <= 7
    }),
    'Over a week': tasks.filter((task) => {
      const due = parseDueDate(task)
      if (!due) return false
      const days = Math.floor((today.getTime() - startOfDay(due).getTime()) / 86400000)
      return days > 7
    }),
  }
}

function emptyMessage(view) {
  switch (view) {
    case 'Today':
      return 'Nothing due today.'
    case 'This Week':
      return 'Clear week ahead.'
    case 'Upcoming':
      return 'No upcoming tasks.'
    case 'Overdue':
      return 'All caught up.'
    default:
      return 'No tasks assigned to you.'
  }
}

function boardColumns(tasks) {
  return [
    { key: 'open', label: 'Open', tasks: tasks.filter((task) => task.status_category === 'open') },
    { key: 'in_progress', label: 'In Progress', tasks: tasks.filter((task) => task.status_category === 'in_progress') },
    { key: 'completed', label: 'Completed', tasks: tasks.filter((task) => task.status_category === 'completed') },
    { key: 'cancelled', label: 'Cancelled', tasks: tasks.filter((task) => task.status_category === 'cancelled') },
  ]
}

export default function MyTasks() {
  const { profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [activeView, setActiveView] = useState('Today')

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

  useEffect(() => {
    load()
  }, [profile?.id])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('new') === 'true') {
      setModal({ mode: 'create' })
      navigate('/my-tasks', { replace: true })
    }
  }, [location.search, navigate])

  const today = startOfDay(new Date())
  const endOfCurrentWeek = startOfDay(endOfWeek(today, { weekStartsOn: 1 }))

  const counts = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((view) => [view, filterTasksByView(tasks, view, today, endOfCurrentWeek).length]),
      ),
    [tasks, today, endOfCurrentWeek],
  )

  const visibleTasks = useMemo(
    () => filterTasksByView(tasks, activeView, today, endOfCurrentWeek),
    [tasks, activeView, today, endOfCurrentWeek],
  )

  const overdueBuckets = useMemo(
    () => overdueGroups(visibleTasks, today),
    [visibleTasks, today],
  )
  const columns = useMemo(() => boardColumns(visibleTasks), [visibleTasks])

  function handleSaved(saved) {
    setTasks((prev) =>
      prev.some((task) => task.id === saved.id)
        ? prev.map((task) => (task.id === saved.id ? saved : task))
        : [saved, ...prev],
    )
  }

  function handleDeleted(taskId) {
    setTasks((prev) => prev.filter((task) => task.id !== taskId))
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">My Work</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tasks assigned to you, grouped by time horizon.</p>
          </div>

          <div className="flex items-center gap-2 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
            {['board', 'list'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === mode ? 'white' : 'transparent',
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                {mode === 'board' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{
                borderColor: activeView === view ? 'var(--accent)' : 'var(--border)',
                background: activeView === view ? 'var(--accent-light)' : 'white',
                color: activeView === view ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {view} ({counts[view] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner label="Loading tasks" /></div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white px-6 py-10 text-center text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
            {emptyMessage(activeView)}
          </div>
        ) : activeView === 'Overdue' && viewMode === 'list' ? (
          <div className="space-y-5">
            {Object.entries(overdueBuckets).map(([label, group]) => (
              <div key={label} className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{label}</h2>
                  <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
                    {group.length}
                  </span>
                </div>
                {group.length > 0 ? (
                  <TaskListView tasks={group} onTaskClick={(task) => setModal({ mode: 'edit', task })} />
                ) : (
                  <div className="text-sm text-[var(--text-tertiary)]">No tasks in this range.</div>
                )}
              </div>
            ))}
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
            <TaskListView tasks={visibleTasks} onTaskClick={(task) => setModal({ mode: 'edit', task })} />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((column) => (
              <div key={column.key} className="min-w-[280px] flex-1 rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{column.label}</h2>
                  <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">{column.tasks.length}</span>
                </div>
                <div className="space-y-3">
                  {column.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setModal({ mode: 'edit', task })}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-left"
                    >
                      <div className="text-sm font-medium text-[var(--text-primary)]">{task.title}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {task.due_date ? `Due ${formatDueDate(task.due_date).label}` : 'No due date'}
                      </div>
                    </button>
                  ))}
                  {column.tasks.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">No tasks</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isPersonal={modal.isPersonal ?? false}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  )
}
