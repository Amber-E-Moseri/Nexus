import { Bell, Check, Clock3, Mail, MessageSquare, TriangleAlert, UserRoundPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatNotificationMessage } from '../features/notifications'
import { formatRelativeDate } from '../lib/dateUtils'
import { getTaskById } from '../features/tasks/lib/tasks'
import { supabase } from '../lib/supabase'
import TaskModal from '../features/tasks/components/TaskModal'
import { useAuth } from '../hooks/useAuth'

const FILTERS = ['All', 'Unread']

function initials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function activityDescription(item) {
  const actor = item.payload?.actor_name ?? 'Someone'
  const taskTitle = item.payload?.task_title ?? 'a task'

  switch (item.action) {
    case 'task_assigned':
      return `${actor} assigned you ${taskTitle}`
    case 'task_status_changed':
      return `${actor} updated ${taskTitle}`
    case 'task_due_changed':
      return `System is due today ${taskTitle}`
    case 'comment_added':
      return `${actor} commented on ${taskTitle}`
    case 'comment_assigned':
      return `${actor} assigned you ${taskTitle}`
    case 'dependency_added':
      return `${actor} flagged as blocked ${taskTitle}`
    default:
      return `${actor} updated ${taskTitle}`
  }
}

function getFeedMeta(item) {
  if (item.kind === 'notification') {
    return {
      icon: Mail,
      iconClassName: 'bg-[#F1ECFF] text-[#5B33B6]',
      title: formatNotificationMessage(item),
      actor: item.payload?.actor_name ?? 'System',
    }
  }

  if (item.action === 'comment_added') {
    return {
      icon: MessageSquare,
      iconClassName: 'bg-[#F7F1E8] text-[#8C6331]',
      title: activityDescription(item),
      actor: item.payload?.actor_name ?? 'Someone',
    }
  }

  if (item.action === 'dependency_added' || item.payload?.new_status === 'blocked') {
    return {
      icon: TriangleAlert,
      iconClassName: 'bg-[#FFF0EC] text-[#D14F38]',
      title: activityDescription(item),
      actor: item.payload?.actor_name ?? 'Someone',
    }
  }

  if (item.action === 'task_due_changed') {
    return {
      icon: Clock3,
      iconClassName: 'bg-[#FFF8E8] text-[#D38A12]',
      title: activityDescription(item),
      actor: 'System',
    }
  }

  if (item.action === 'task_assigned' || item.action === 'comment_assigned') {
    return {
      icon: UserRoundPlus,
      iconClassName: 'bg-[#F1ECFF] text-[#6A42C7]',
      title: activityDescription(item),
      actor: item.payload?.actor_name ?? 'Someone',
    }
  }

  if (item.action === 'task_status_changed' && ['done', 'completed'].includes(item.payload?.new_status)) {
    return {
      icon: Check,
      iconClassName: 'bg-[#ECF9F1] text-[#3F8E63]',
      title: activityDescription(item),
      actor: item.payload?.actor_name ?? 'Someone',
    }
  }

  return {
    icon: Bell,
    iconClassName: 'bg-[#F4F0EA] text-[#77624A]',
    title: activityDescription(item),
    actor: item.payload?.actor_name ?? 'Someone',
  }
}

function combineFeedItems({ assignedComments, activityItems, notifications }) {
  const assigned = assignedComments.map((comment) => ({
    id: `assigned-${comment.id}`,
    kind: 'assigned',
    unread: true,
    created_at: comment.assigned_at ?? comment.created_at,
    payload: {
      actor_name: comment.author?.name ?? 'Someone',
      task_id: comment.task?.id ?? null,
      task_title: comment.task?.title ?? 'a task',
    },
    title: `${comment.author?.name ?? 'Someone'} assigned you ${comment.task?.title ?? 'a task'}`,
    comment,
  }))

  const activity = activityItems.map((item) => ({
    ...item,
    kind: 'activity',
    unread: !item.read,
  }))

  const inboxNotifications = notifications.map((item) => ({
    ...item,
    kind: 'notification',
    unread: !item.read,
  }))

  return [...assigned, ...activity, ...inboxNotifications].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  )
}

export default function Inbox() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState('All')
  const [assignedComments, setAssignedComments] = useState([])
  const [activityItems, setActivityItems] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskModal, setTaskModal] = useState(null)

  useEffect(() => {
    if (!profile?.id) return

    let active = true

    async function loadInbox() {
      setLoading(true)

      const [
        { data: assignedRows },
        { data: activityRows },
        { data: notificationRows },
      ] = await Promise.all([
        supabase
          .from('task_comments')
          .select(`
            id,
            body,
            assigned_at,
            created_at,
            task:tasks!task_id(id, title, department_id, assignee_id, created_by, sprint_id),
            author:users!author_id(id, name)
          `)
          .eq('assigned_to', profile.id)
          .is('resolved_at', null)
          .order('assigned_at', { ascending: false }),
        supabase
          .from('activity_feed')
          .select('id, user_id, action, payload, read, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('notifications')
          .select('id, user_id, type, payload, read, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (!active) return

      setAssignedComments(assignedRows ?? [])
      setActivityItems(activityRows ?? [])
      setNotifications(notificationRows ?? [])
      setLoading(false)
    }

    loadInbox().catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [profile?.id])

  const combinedFeed = useMemo(
    () => combineFeedItems({ assignedComments, activityItems, notifications }),
    [assignedComments, activityItems, notifications],
  )

  const unreadCount = combinedFeed.filter((item) => item.unread).length
  const filteredFeed = filter === 'Unread'
    ? combinedFeed.filter((item) => item.unread)
    : combinedFeed

  async function openTask(taskId) {
    if (!taskId) return
    const task = await getTaskById(taskId)
    setTaskModal(task)
  }

  async function markAllRead() {
    const unreadActivityIds = activityItems.filter((item) => !item.read).map((item) => item.id)
    const unreadNotificationIds = notifications.filter((item) => !item.read).map((item) => item.id)

    setActivityItems((prev) => prev.map((item) => ({ ...item, read: true })))
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))

    await Promise.all([
      unreadActivityIds.length
        ? supabase.from('activity_feed').update({ read: true }).in('id', unreadActivityIds)
        : Promise.resolve(),
      unreadNotificationIds.length
        ? supabase.from('notifications').update({ read: true }).in('id', unreadNotificationIds)
        : Promise.resolve(),
    ])
  }

  async function handleItemClick(item) {
    if (item.kind === 'assigned') {
      await openTask(item.comment?.task?.id)
      return
    }

    if (item.kind === 'activity') {
      if (!item.read) {
        setActivityItems((prev) => prev.map((entry) => (
          entry.id === item.id ? { ...entry, read: true } : entry
        )))
        await supabase.from('activity_feed').update({ read: true }).eq('id', item.id)
      }

      await openTask(item.payload?.task_id)
      return
    }

    if (!item.read) {
      setNotifications((prev) => prev.map((entry) => (
        entry.id === item.id ? { ...entry, read: true } : entry
      )))
      await supabase.from('notifications').update({ read: true }).eq('id', item.id)
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
              No inbox items.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
              {filteredFeed.map((item, index) => {
                const meta = item.kind === 'assigned'
                  ? {
                    icon: UserRoundPlus,
                    iconClassName: 'bg-[#F1ECFF] text-[#6A42C7]',
                    title: item.title,
                    actor: item.payload?.actor_name ?? 'Someone',
                  }
                  : getFeedMeta(item)

                const Icon = meta.icon

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={[
                      'flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[var(--surface-secondary)]',
                      index < filteredFeed.length - 1 ? 'border-b border-[var(--border)]' : '',
                    ].join(' ')}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.iconClassName}`}>
                      {item.kind === 'activity' && !['task_due_changed'].includes(item.action) ? (
                        <span className="text-[11px] font-bold">{initials(meta.actor)}</span>
                      ) : (
                        <Icon size={14} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] text-[var(--text-primary)]">
                        <span className="font-semibold">{meta.title}</span>
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-tertiary)]">
                        {formatRelativeDate(item.created_at, { includeTime: true })}
                      </div>
                    </div>

                    {item.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F26B55]" /> : null}
                  </button>
                )
              })}
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
