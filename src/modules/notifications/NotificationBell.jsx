import { Bell } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationsContext'
import NotificationItem from './NotificationItem'

export default function NotificationBell() {
  const navigate = useNavigate()
  const { notifications, unreadCount, isOpen, setIsOpen, markAllAsRead } = useNotifications()
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
    }

    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, setIsOpen])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#E24B4A',
              border: '1.5px solid white',
            }}
          />
        ) : null}
      </button>

      {isOpen ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            maxHeight: 480,
            background: 'var(--surface)',
            border: '0.5px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(14,14,30,0.14)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Notifications
              {unreadCount > 0 ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '1px 6px',
                    borderRadius: 20,
                    background: 'var(--accent-muted)',
                    color: 'var(--accent)',
                  }}
                >
                  {unreadCount}
                </span>
              ) : null}
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  fontSize: 11,
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))
            )}
          </div>

          {notifications.length > 5 && (
            <div
              style={{
                borderTop: '0.5px solid var(--border)',
                padding: '10px 16px',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/notifications')
                }}
                style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
