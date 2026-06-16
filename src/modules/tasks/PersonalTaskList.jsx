import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { formatDueDate } from '../../lib/dateUtils'
import { createTask, deleteTask, getPersonalTasks, updateTask } from '../../lib/tasks'
import {
  STATUS_CATEGORIES,
  getCategoryStatusId,
  getTaskStatusColor,
  getTaskStatusLabel,
  isTaskCompleted,
} from '../../lib/taskStatuses'
import TaskModal from './TaskModal'
import { PRIORITY_STYLES } from '../../lib/priorities'

export default function PersonalTaskList() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    try {
      const data = await getPersonalTasks(profile.id)
      setTasks(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profile?.id])

  async function handleToggleDone(task) {
    const targetCategory = isTaskCompleted(task) ? STATUS_CATEGORIES.OPEN : STATUS_CATEGORIES.COMPLETED
    const nextStatusId = await getCategoryStatusId({ category: targetCategory })
    const updated = await updateTask(task.id, {
      statusId: nextStatusId,
      statusCategory: targetCategory,
    })
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
  }

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

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tasks.length === 0 && (
          <div
            style={{
              padding: '32px', textAlign: 'center',
              color: 'var(--text-tertiary)', fontSize: 13,
              border: '1px dashed var(--border)', borderRadius: 10,
            }}
          >
            No private tasks yet.
          </div>
        )}

        {tasks.map((task) => {
          const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium
          const statusColor = getTaskStatusColor(task)
          const due = formatDueDate(task.due_date)
          const dueColor = due.status === 'overdue'
            ? 'var(--coral-dark)'
            : due.status === 'today'
              ? 'var(--accent)'
              : due.status === 'soon'
                ? 'var(--amber)'
                : 'var(--text-tertiary)'

          return (
            <div
              key={task.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'white',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
            >
              <input
                type="checkbox"
                checked={isTaskCompleted(task)}
                onChange={() => handleToggleDone(task)}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1, fontSize: 13, color: 'var(--text-primary)',
                  fontWeight: 400,
                  textDecoration: isTaskCompleted(task) ? 'line-through' : 'none',
                  opacity: isTaskCompleted(task) ? 0.5 : 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                onClick={() => setModal({ mode: 'edit', task })}
              >
                {task.title}
              </span>

              <span
                style={{
                  fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
                  background: priority.bg, color: priority.text, flexShrink: 0,
                }}
              >
                {task.priority}
              </span>

              {task.due_date && (
                <span style={{ fontSize: 11, color: dueColor, fontWeight: due.status === 'normal' ? 400 : 500, flexShrink: 0 }}>
                  {due.label}
                </span>
              )}

              <span
                style={{
                  fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
                  background: `${statusColor}22`, color: statusColor, flexShrink: 0,
                }}
              >
                {getTaskStatusLabel(task)}
              </span>
            </div>
          )
        })}
      </div>

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isPersonal={true}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}
