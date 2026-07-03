import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMyTasks } from '../../features/tasks'
import { isTaskCompleted } from '../../lib/taskStatuses'
import TaskCalendarView from '../../features/tasks/components/TaskCalendarView'
import TaskDetailSidebar from '../../features/sprints/components/TaskDetailSidebar'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { TasksProvider } from '../../features/tasks/TasksContext'

function UpcomingTasksList({ tasks, onTaskClick }) {
  const upcomingTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks
      .filter((task) => {
        if (isTaskCompleted(task)) return false
        if (!task.due_date) return false
        const dueDate = new Date(task.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate >= today
      })
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 15)
  }, [tasks])

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
  }

  const priorityColors = {
    urgent: '#C94830',
    high: '#E8762B',
    medium: '#4C2A92',
    low: '#6B7280',
  }

  return (
    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Upcoming Tasks
        </h2>
        <span style={{ fontSize: '12px', fontWeight: 600, background: '#F2EEE6', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '999px' }}>
          {upcomingTasks.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {upcomingTasks.length > 0 ? (
          upcomingTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick?.(task)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: '#FFFFFF',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-secondary)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: priorityColors[task.priority] || '#6B7280',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {task.department?.name || 'No space'}
                </div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {formatDate(task.due_date)}
              </div>
            </button>
          ))
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            No upcoming tasks
          </div>
        )}
      </div>
    </div>
  )
}

export default function TaskCalendarPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768)

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  async function loadTasks() {
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
    loadTasks()
  }, [profile?.id])

  function handleSaved(saved) {
    setTasks((prev) =>
      prev.some((task) => task.id === saved.id)
        ? prev.map((task) => (task.id === saved.id ? saved : task))
        : [saved, ...prev],
    )
    setSelectedTask(null)
  }

  function handleDeleted(taskId) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTask(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Task Calendar</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">View all your tasks across spaces organized by due date.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading tasks" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="rounded-[16px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
            <TasksProvider>
              <TaskCalendarView
                filteredTasks={tasks}
                onTaskClick={(task) => setSelectedTask({ mode: 'edit', task })}
                onAddTask={() => setSelectedTask({ mode: 'create' })}
                userId={profile?.id}
              />
            </TasksProvider>
          </div>

          <div>
            <UpcomingTasksList tasks={tasks} onTaskClick={(task) => setSelectedTask({ mode: 'edit', task })} />
          </div>
        </div>
      )}

      {selectedTask && isDesktop ? (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 50 }}>
          <div style={{ flex: 1 }} onClick={() => setSelectedTask(null)} />
          <div style={{ width: '380px', display: 'flex', boxShadow: '-4px 0 16px rgba(0,0,0,0.1)' }}>
            <TaskDetailSidebar
              mode={selectedTask.mode}
              task={selectedTask.task}
              isPersonal={true}
              onClose={() => setSelectedTask(null)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              isModal={false}
            />
          </div>
        </div>
      ) : null}

      {selectedTask && !isDesktop ? (
        <TaskDetailSidebar
          mode={selectedTask.mode}
          task={selectedTask.task}
          isPersonal={true}
          onClose={() => setSelectedTask(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          isModal={true}
        />
      ) : null}
    </div>
  )
}
