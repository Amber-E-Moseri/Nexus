// Notification dropdown row (ClickUp UI refresh pass). Visual layer only —
// unread state is shown with a live-purple dot instead of a row tint;
// markAsRead / close behavior unchanged.

import { useState } from 'react'
import { useNotifications } from '../../../context/NotificationsContext'
import { formatNotificationMessage, NOTIFICATION_TYPES } from '../lib/notifications'
import { FONT_BODY, FONT_MONO } from '../../../lib/fonts'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationItem({ notification }) {
  const { markAsRead, setIsOpen } = useNotifications()
  const [hovered, setHovered] = useState(false)
  const def = NOTIFICATION_TYPES[notification.type] ?? { icon: '🔔' }
  const message = formatNotificationMessage(notification)

  async function handleClick() {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    setIsOpen(false)
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 16px',
        background: hovered ? 'var(--surface-sub)' : 'transparent',
        borderBottom: '1px solid var(--border-1)',
        cursor: 'pointer',
        transition: 'background 0.13s',
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          background: 'var(--purple-tint)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
        }}
      >
        {def.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 12,
            color: notification.read ? 'var(--ink-2)' : 'var(--ink-1)',
            lineHeight: 1.5,
            fontWeight: notification.read ? 400 : 600,
          }}
        >
          {message}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
          {timeAgo(notification.created_at)}
        </div>
      </div>
      {!notification.read ? (
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--purple-500)',
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      ) : null}
    </div>
  )
}
