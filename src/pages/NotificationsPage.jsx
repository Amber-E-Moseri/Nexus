import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../context/NotificationsContext'
import { getNotifications, markAsRead, markAllAsRead } from '../features/notifications'
import { supabase } from '../lib/supabase'
import {
  CheckSquare, MessageSquare, Calendar, CalendarCheck, CalendarX, AtSign, Bell,
} from 'lucide-react'

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

function formatNotificationText(notification) {
  const { type, payload = {} } = notification
  const actor = payload.actor_name || 'Someone'
  const title = payload.task_title || payload.meeting_title || 'item'

  switch (type) {
    case 'task_assigned':
      return `${actor} assigned you "${title}"`
    case 'task_comment':
      return `${actor} commented on "${title}"`
    case 'meeting_created':
      return `New meeting: "${title}"`
    case 'event_approved':
      return `Your event was approved`
    case 'event_rejected':
      return `Your event was rejected`
    case 'mention':
      return `${actor} mentioned you in "${title}"`
    case 'system':
      return payload.message || 'System notification'
    default:
      return payload.message || type
  }
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

      const { data, error } = await query.limit(pageSize + 1).offset(newOffset)

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

  const filteredNotifications = notifications

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Notifications
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Stay updated with all your notifications
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Unread', 'Read'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setFilter(tab)
                setNotifications([])
                setOffset(0)
              }}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                background: filter === tab ? 'var(--accent)' : 'transparent',
                color: filter === tab ? 'white' : 'var(--text-secondary)',
                border: filter === tab ? 'none' : '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {notifications.some((n) => !n.read) && (
          <button
            onClick={handleMarkAllAsRead}
            style={{
              fontSize: 12,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 500,
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 20, marginBottom: 12 }}>⏳</div>
          <div>Loading notifications...</div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🔔</div>
          <div>You're all caught up.</div>
        </div>
      ) : (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'white' }}>
          {filteredNotifications.map((notification, index) => {
            const IconComponent = NOTIFICATION_TYPE_ICONS[notification.type] || Bell
            return (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  background: notification.read ? 'white' : 'var(--accent-muted)',
                  borderBottom: index < filteredNotifications.length - 1 ? '0.5px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = notification.read ? 'var(--surface-secondary)' : 'var(--accent-light)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = notification.read ? 'white' : 'var(--accent-muted)' }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: 'var(--surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                  }}
                >
                  <IconComponent size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      lineHeight: 1.5,
                      fontWeight: notification.read ? 400 : 500,
                    }}
                  >
                    {formatNotificationText(notification)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {timeAgo(notification.created_at)}
                  </div>
                </div>
                {!notification.read && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={handleLoadMore}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 500,
              color: 'white',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
