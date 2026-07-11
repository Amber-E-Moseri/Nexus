// Inbox — unified notification feed (ClickUp UI refresh pass).
// Visual layer only: data loading, read persistence (same supabase
// update calls), filtering, and the task-modal hand-off are unchanged.

import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRelativeDate } from '../lib/dateUtils'
import { getTaskById } from '../features/tasks/lib/tasks'
import { formatNotificationMessage, NOTIFICATION_TYPES } from '../features/notifications/lib/notifications'
import { supabase } from '../lib/supabase'
import TaskModal from '../features/tasks/components/TaskModal'
import { useAuth } from '../hooks/useAuth'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../lib/fonts'

const FILTERS = ['All', 'Unread']

const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

const rowEnter = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34 } },
}

function groupByRecency(items) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const today = items.filter((item) => new Date(item.created_at) >= startOfToday)
  const earlier = items.filter((item) => new Date(item.created_at) < startOfToday)

  return [
    { label: 'Today', items: today },
    { label: 'Earlier', items: earlier },
  ].filter((group) => group.items.length > 0)
}

function GroupHeader({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '18px 0 8px',
      }}
    >
      <span
        style={{
          fontFamily: FONT_HEADING,
          fontSize: 11.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--ink-3)',
          flexShrink: 0,
        }}
      >
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
    </div>
  )
}

function InboxRow({ item, isLast, onOpen, onMarkRead }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      variants={rowEnter}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(item)
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 16px',
        cursor: 'pointer',
        background: hovered ? 'var(--surface-sub)' : 'var(--surface-card)',
        borderBottom: isLast ? 'none' : '1px solid var(--border-1)',
        transition: 'background 0.13s',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          flexShrink: 0,
          background: 'var(--purple-tint)',
          color: 'var(--purple-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Mail size={14} />
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13.5,
            fontWeight: item.read ? 500 : 600,
            color: item.read ? 'var(--ink-2)' : 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        {item.description ? (
          <div
            style={{
              marginTop: 2,
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: 'var(--ink-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.description}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 3,
            fontFamily: FONT_MONO,
            fontSize: 10.5,
            color: 'var(--ink-3)',
          }}
        >
          {formatRelativeDate(item.created_at, { includeTime: true })}
        </div>
      </div>

      {/* Hover-revealed quick action. Archive/snooze intentionally omitted:
          notifications have no archived/snoozed state in the schema and
          backend changes are out of scope for this pass. */}
      <AnimatePresence>
        {hovered && !item.read ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.14 }}
            whileTap={{ scale: 0.92 }}
            onClick={(event) => {
              event.stopPropagation()
              onMarkRead(item)
            }}
            title="Mark read"
            aria-label="Mark read"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              borderRadius: 7,
              border: '1px solid var(--border-2)',
              background: 'var(--surface-card)',
              color: 'var(--purple-600)',
              fontFamily: FONT_BODY,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Check size={12} />
            Mark read
          </motion.button>
        ) : null}
      </AnimatePresence>

      {!item.read ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--purple-500)',
            flexShrink: 0,
          }}
        />
      ) : null}
    </motion.div>
  )
}

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
          .select('id, user_id, type, payload, read, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100)

        if (!active) return

        if (notificationError) {
          console.error('Notifications error:', notificationError)
          throw notificationError
        }

        const mapped = (notificationResult ?? []).map((n) => ({
          ...n,
          title: NOTIFICATION_TYPES[n.type]?.label ?? n.type,
          description: formatNotificationMessage(n),
        }))
        setNotifications(mapped)
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
  const groups = groupByRecency(filteredFeed)

  async function markAllRead() {
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id)

    if (unreadIds.length === 0) return

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))

    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  async function markItemRead(item) {
    if (item.read) return
    setNotifications((prev) => prev.map((entry) => (
      entry.id === item.id ? { ...entry, read: true } : entry
    )))
    await supabase.from('notifications').update({ read: true }).eq('id', item.id)
  }

  async function handleItemClick(item) {
    await markItemRead(item)

    // Navigate or perform action based on notification type
    if (item.payload?.task_id) {
      const task = await getTaskById(item.payload.task_id)
      setTaskModal(task)
    }
  }

  return (
    <>
      <div style={{ maxWidth: 860, fontFamily: FONT_BODY }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--ink-1)',
                margin: 0,
              }}
            >
              Inbox
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link
              to="/notifications"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-1)',
                background: 'var(--surface-card)',
                color: 'var(--ink-2)',
                fontFamily: FONT_BODY,
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              View all
            </Link>
            <motion.button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              whileTap={unreadCount > 0 ? { scale: 0.96 } : undefined}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-1)',
                background: 'var(--surface-card)',
                color: 'var(--purple-700)',
                fontFamily: FONT_BODY,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: unreadCount === 0 ? 'default' : 'pointer',
                opacity: unreadCount === 0 ? 0.5 : 1,
                transition: 'border-color 0.13s, background 0.13s',
              }}
              onMouseEnter={(event) => {
                if (unreadCount > 0) event.currentTarget.style.borderColor = 'var(--border-2)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor = 'var(--border-1)'
              }}
            >
              Mark all read
            </motion.button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {FILTERS.map((option) => {
            const isActive = filter === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? 'var(--purple-700)' : 'var(--border-1)'}`,
                  background: isActive ? 'var(--purple-700)' : 'var(--surface-card)',
                  color: isActive ? '#FFFFFF' : 'var(--ink-2)',
                  fontFamily: FONT_BODY,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.13s, border-color 0.13s, color 0.13s',
                }}
                onMouseEnter={(event) => {
                  if (!isActive) event.currentTarget.style.borderColor = 'var(--purple-500)'
                }}
                onMouseLeave={(event) => {
                  if (!isActive) event.currentTarget.style.borderColor = 'var(--border-1)'
                }}
              >
                {option}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div
            style={{
              marginTop: 18,
              padding: 28,
              borderRadius: 16,
              border: '1px solid var(--border-1)',
              background: 'var(--surface-card)',
              fontSize: 13,
              color: 'var(--ink-3)',
            }}
          >
            Loading inbox…
          </div>
        ) : null}

        {!loading ? (
          groups.length === 0 ? (
            <div
              style={{
                marginTop: 18,
                padding: '40px 24px',
                borderRadius: 16,
                border: '1px dashed var(--border-2)',
                background: 'var(--surface-card)',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              <Bell size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
              <div>No notifications yet</div>
            </div>
          ) : (
            <motion.div variants={listStagger} initial="hidden" animate="show" key={filter}>
              {groups.map((group) => (
                <div key={group.label}>
                  <GroupHeader>{group.label}</GroupHeader>
                  <div
                    style={{
                      borderRadius: 14,
                      border: '1px solid var(--border-1)',
                      background: 'var(--surface-card)',
                      boxShadow: '0 1px 3px rgba(28,22,16,.04)',
                      overflow: 'hidden',
                    }}
                  >
                    {group.items.map((item, index) => (
                      <InboxRow
                        key={item.id}
                        item={item}
                        isLast={index === group.items.length - 1}
                        onOpen={handleItemClick}
                        onMarkRead={markItemRead}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
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
