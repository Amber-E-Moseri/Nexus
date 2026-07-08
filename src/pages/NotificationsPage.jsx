// Notifications page (ClickUp UI refresh pass). Visual layer only:
// fetching, pagination, and read/unread persistence are unchanged.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../context/NotificationsContext'
import { getNotifications, markAsRead, markAllAsRead, formatNotificationMessage } from '../features/notifications'
import { supabase } from '../lib/supabase'
import {
  CheckSquare, MessageSquare, Calendar, CalendarCheck, CalendarX, AtSign, Bell,
} from 'lucide-react'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../lib/fonts'

const NOTIFICATION_TYPE_ICONS = {
  task_assigned: CheckSquare,
  task_comment: MessageSquare,
  meeting_created: Calendar,
  event_approved: CalendarCheck,
  event_rejected: CalendarX,
  mention: AtSign,
  system: Bell,
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return new Date(dateStr).toLocaleDateString()
}

function groupByRecency(items) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)

  const today = []
  const thisWeek = []
  const earlier = []

  items.forEach((item) => {
    const created = new Date(item.created_at)
    if (created >= startOfToday) today.push(item)
    else if (created >= startOfWeek) thisWeek.push(item)
    else earlier.push(item)
  })

  return [
    { label: 'Today', items: today },
    { label: 'This week', items: thisWeek },
    { label: 'Earlier', items: earlier },
  ].filter((group) => group.items.length > 0)
}

function GroupHeader({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 8px' }}>
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

function NotificationRow({ notification, isLast, onClick }) {
  const [hovered, setHovered] = useState(false)
  const IconComponent = NOTIFICATION_TYPE_ICONS[notification.type] || Bell

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34 } }}
      exit={{ opacity: 0, height: 0, x: 24, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
      onClick={() => onClick(notification)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        cursor: 'pointer',
        overflow: 'hidden',
        background: hovered ? 'var(--surface-sub)' : 'var(--surface-card)',
        borderBottom: isLast ? 'none' : '1px solid var(--border-1)',
        transition: 'background 0.13s',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          flexShrink: 0,
          background: 'var(--purple-tint)',
          color: 'var(--purple-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconComponent size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            lineHeight: 1.5,
            fontWeight: notification.read ? 400 : 600,
            color: notification.read ? 'var(--ink-2)' : 'var(--ink-1)',
          }}
        >
          {formatNotificationMessage(notification)}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
          {timeAgo(notification.created_at)}
        </div>
      </div>
      {!notification.read && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--purple-500)',
            flexShrink: 0,
          }}
        />
      )}
    </motion.div>
  )
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { markAsRead: contextMarkAsRead, markAllAsRead: contextMarkAllAsRead } = useNotifications()
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 20

  const loadNotifications = useCallback(async (newOffset = 0) => {
    if (!user?.id) return

    try {
      setLoading(true)
      const query = supabase
        .from('notifications')
        .select('id, user_id, type, payload, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (filter === 'Unread') {
        query.eq('read', false)
      }

      const { data, error } = await query.range(newOffset, newOffset + pageSize)

      if (error) throw error

      const items = data ?? []
      setHasMore(items.length > pageSize)
      setNotifications(newOffset === 0 ? items.slice(0, pageSize) : [...notifications, ...items.slice(0, pageSize)])
      setOffset(newOffset)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, filter, notifications])

  useEffect(() => {
    setNotifications([])
    setOffset(0)
    loadNotifications(0)
  }, [filter])

  async function handleMarkAllAsRead() {
    try {
      await contextMarkAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      await contextMarkAsRead(notification.id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      )
    }

    // TODO: Navigate to linked resource if available
    // if (notification.payload?.link_url) navigate(notification.payload.link_url)
    // if (notification.payload?.task_id) navigate(`/my-tasks`, { state: { taskId: notification.payload.task_id } })
  }

  function handleLoadMore() {
    loadNotifications(offset + pageSize)
  }

  // Under the Unread tab, items marked read animate out via AnimatePresence
  // instead of lingering until the next refetch. Read state persistence is
  // untouched — this only filters the local display list.
  const filteredNotifications = filter === 'Unread'
    ? notifications.filter((n) => !n.read)
    : notifications
  const groups = groupByRecency(filteredNotifications)

  return (
    <div style={{ maxWidth: 800, fontFamily: FONT_BODY }}>
      <div style={{ marginBottom: 20 }}>
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
          Notifications
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '6px 0 0' }}>
          Stay updated with all your notifications
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 4, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Unread', 'Read'].map((tab) => {
            const isActive = filter === tab
            return (
              <button
                key={tab}
                onClick={() => {
                  setFilter(tab)
                  setNotifications([])
                  setOffset(0)
                }}
                style={{
                  padding: '5px 14px',
                  fontFamily: FONT_BODY,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: isActive ? 'var(--purple-700)' : 'var(--surface-card)',
                  color: isActive ? '#FFFFFF' : 'var(--ink-2)',
                  border: `1px solid ${isActive ? 'var(--purple-700)' : 'var(--border-1)'}`,
                  borderRadius: 999,
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
                {tab}
              </button>
            )
          })}
        </div>

        {notifications.some((n) => !n.read) && (
          <button
            onClick={handleMarkAllAsRead}
            style={{
              padding: '6px 12px',
              borderRadius: 9,
              border: '1px solid var(--border-1)',
              background: 'var(--surface-card)',
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: 'var(--purple-700)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'border-color 0.13s',
            }}
            onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--border-2)' }}
            onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border-1)' }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-3)', fontSize: 13 }}>
          <div style={{ fontSize: 20, marginBottom: 12 }}>⏳</div>
          <div>Loading notifications...</div>
        </div>
      ) : groups.length === 0 ? (
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
          <div style={{ fontSize: 24, marginBottom: 10 }}>🔔</div>
          <div>You're all caught up.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <GroupHeader>{group.label}</GroupHeader>
            <div
              style={{
                border: '1px solid var(--border-1)',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--surface-card)',
                boxShadow: '0 1px 3px rgba(28,22,16,.04)',
              }}
            >
              <AnimatePresence initial={false}>
                {group.items.map((notification, index) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    isLast={index === group.items.length - 1}
                    onClick={handleNotificationClick}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <motion.button
            onClick={handleLoadMore}
            disabled={loading}
            whileTap={loading ? undefined : { scale: 0.96 }}
            style={{
              padding: '9px 18px',
              fontFamily: FONT_BODY,
              fontSize: 12.5,
              fontWeight: 600,
              color: '#FFFFFF',
              background: 'var(--purple-700)',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'background 0.13s',
            }}
            onMouseEnter={(event) => {
              if (!loading) event.currentTarget.style.background = 'var(--purple-600)'
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'var(--purple-700)'
            }}
          >
            {loading ? 'Loading...' : 'Load more'}
          </motion.button>
        </div>
      )}
    </div>
  )
}
