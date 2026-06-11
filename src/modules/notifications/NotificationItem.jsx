import { useNotifications } from '../../context/NotificationsContext'
import { formatNotificationMessage, NOTIFICATION_TYPES } from '../../lib/notifications'

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
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 16px',
        background: notification.read ? 'transparent' : 'var(--accent-muted)',
        borderBottom: '0.5px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'var(--surface-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        {def.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            fontWeight: notification.read ? 400 : 500,
          }}
        >
          {message}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {timeAgo(notification.created_at)}
        </div>
      </div>
      {!notification.read ? (
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      ) : null}
    </div>
  )
}
