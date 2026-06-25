import { Bell, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeDate } from '../lib/dateUtils'
import { getTaskById } from '../features/tasks/lib/tasks'
import { supabase } from '../lib/supabase'
import TaskModal from '../features/tasks/components/TaskModal'
import { useAuth } from '../hooks/useAuth'

const FILTERS = ['All', 'Unread']

export default function Inbox() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState('All')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskModal, setTaskModal] = useState(null)

  useEffect(() => {
    if (!profile?.id) return

    let active = true

    async function loadInbox() {
      setLoading(true)

      try {
        const { data: notificationResult, error: notificationError } = await supabase
          .from('notifications')
          .select('id, user_id, type, payload, read, created_at, title, description')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100)

        if (!active) return

        if (notificationError) {
          console.error('Notifications error:', notificationError)
          throw notificationError
        }

        setNotifications(notificationResult ?? [])
      } catch (err) {
        console.error('Failed to load notifications:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInbox()

    return () => {
      active = false
    }
  }, [profile?.id])

  const unreadCount = notifications.filter((item) => !item.read).length
  const filteredFeed = filter === 'Unread'
    ? notifications.filter((item) => !item.read)
    : notifications

  async function markAllRead() {
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id)

    if (unreadIds.length === 0) return

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))

    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  async function handleItemClick(item) {
    // Mark as read
    if (!item.read) {
      setNotifications((prev) => prev.map((entry) => (
        entry.id === item.id ? { ...entry, read: true } : entry
      )))
      await supabase.from('notifications').update({ read: true }).eq('id', item.id)
    }

    // Navigate or perform action based on notification type
    if (item.payload?.task_id) {
      const task = await getTaskById(item.payload.task_id)
      setTaskModal(task)
    }
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Inbox</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}.
            </p>
          </div>

          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--accent)] disabled:cursor-default disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>

        <div className="flex gap-2">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                filter === option
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] bg-white text-[var(--text-secondary)]',
              ].join(' ')}
            >
              {option}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
            Loading inbox…
          </div>
        ) : null}

        {!loading ? (
          filteredFeed.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white px-6 py-10 text-center text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
              <Bell className="mx-auto mb-3 h-8 w-8 opacity-30" />
              No notifications yet
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
              {filteredFeed.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={[
                    'flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[var(--surface-secondary)]',
                    index < filteredFeed.length - 1 ? 'border-b border-[var(--border)]' : '',
                  ].join(' ')}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F1ECFF] text-[#6A42C7]">
                    <Mail size={14} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] text-[var(--text-primary)]">
                      <span className="font-semibold">{item.title}</span>
                    </div>
                    {item.description && (
                      <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                        {item.description}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-[var(--text-tertiary)]">
                      {formatRelativeDate(item.created_at, { includeTime: true })}
                    </div>
                  </div>

                  {!item.read ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F26B55]" /> : null}
                </button>
              ))}
            </div>
          )
        ) : null}
      </div>

      {taskModal ? (
        <TaskModal
          mode="edit"
          task={taskModal}
          departmentId={taskModal.department_id}
          sprintId={taskModal.sprint_id}
          onClose={() => setTaskModal(null)}
          onSaved={setTaskModal}
          onDeleted={() => setTaskModal(null)}
        />
      ) : null}
    </>
  )
}
