// Notification bell + dropdown (ClickUp UI refresh pass). Visual layer only:
// open/close handling, mark-all-read, and navigation are unchanged. The
// dropdown enters/exits with a spring via AnimatePresence.

import { AnimatePresence, motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../../context/NotificationsContext'
import NotificationItem from './NotificationItem'
import { FONT_BODY, FONT_HEADING } from '../../../lib/fonts'

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
        aria-label="Notifications"
        style={{
          padding: 8,
          borderRadius: 10,
          border: '1px solid var(--border-1)',
          background: 'var(--surface-card)',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.13s, border-color 0.13s',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.color = 'var(--ink-1)'
          event.currentTarget.style.borderColor = 'var(--border-2)'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = 'var(--ink-3)'
          event.currentTarget.style.borderColor = 'var(--border-1)'
        }}
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
              background: 'var(--purple-500)',
              border: '1.5px solid white',
            }}
          />
        ) : null}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 480, damping: 34 } }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.14 } }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 360,
              maxHeight: 480,
              background: 'var(--surface-card)',
              border: '1px solid var(--border-1)',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(28,22,16,0.12)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100,
              fontFamily: FONT_BODY,
              transformOrigin: 'top right',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-1)',
              }}
            >
              <span
                style={{
                  fontFamily: FONT_HEADING,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-1)',
                }}
              >
                Notifications
                {unreadCount > 0 ? (
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: FONT_BODY,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: 20,
                      background: 'var(--purple-tint)',
                      color: 'var(--purple-600)',
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
                    fontFamily: FONT_BODY,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--purple-700)',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-1)',
                    borderRadius: 7,
                    cursor: 'pointer',
                    padding: '3px 8px',
                    transition: 'border-color 0.13s',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--border-2)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border-1)' }}
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
                    color: 'var(--ink-3)',
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
                  borderTop: '1px solid var(--border-1)',
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
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    color: 'var(--purple-700)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--purple-600)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--purple-700)' }}
                >
                  View all notifications
                </button>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
