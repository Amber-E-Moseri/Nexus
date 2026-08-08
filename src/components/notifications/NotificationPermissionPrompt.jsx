import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { pushSupported, requestPushPermission } from '../../lib/webPush'
import { Bell, X } from 'lucide-react'

export default function NotificationPermissionPrompt() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !user) return

    const permission = Notification.permission
    if (permission === 'granted') return

    const dismissedAt = localStorage.getItem('notification-permission-dismissed-at')
    const neverShowAgain = localStorage.getItem('notification-permission-never')
    // Re-prompt after 7 days so users who clicked "Not now" get another chance
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    const dismissed = dismissedAt && (Date.now() - parseInt(dismissedAt, 10)) < SEVEN_DAYS

    if (permission === 'denied') {
      if (!dismissed && !neverShowAgain) setDenied(true)
      return
    }

    if (!dismissed && !neverShowAgain) {
      setTimeout(() => setShow(true), 10000)
    }
  }, [user])

  const dismiss = () => {
    // "Not now" = permanent dismiss (same as "Don't show again")
    localStorage.setItem('notification-permission-never', 'true')
    setShow(false)
    setDenied(false)
  }

  const requestPermission = async () => {
    setLoading(true)
    try {
      if (pushSupported()) {
        // In prod (SW registered): request browser permission + subscribe to Web Push in one shot.
        // requestPushPermission() handles permission dialog, SW subscription, and DB write.
        // Push subscription failing (network, VAPID mismatch) is non-fatal — permission may
        // still be granted, so we fall through to the Notification.permission check below.
        await requestPushPermission()
      } else {
        // Dev mode or browser without PushManager: request browser permission only.
        await Notification.requestPermission()
      }

      if (Notification.permission === 'granted') {
        setShow(false)
        // eslint-disable-next-line no-new
        new Notification('Notifications enabled', {
          body: 'You will now receive alerts for task assignments, @mentions, and comments.',
          icon: '/logo.png',
        })
      } else {
        // User denied in the browser dialog — show the "blocked" banner next time
        localStorage.removeItem('notification-permission-dismissed')
        setShow(false)
        setDenied(true)
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err)
    } finally {
      setLoading(false)
    }
  }

  const overlayStyle = {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    maxWidth: '480px',
    width: 'calc(100vw - 48px)',
  }

  if (denied) {
    return (
      <div style={{
        ...overlayStyle,
        backgroundColor: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
      }}>
        <Bell size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
          Browser notifications are blocked.{' '}
          <strong>Click the lock icon</strong> in your address bar → Notifications → Allow, then reload.
        </p>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  if (!show) return null

  return (
    <div style={{
      ...overlayStyle,
      backgroundColor: 'var(--surface-primary, #fff)',
      border: '1px solid var(--accent)',
    }}>
      <Bell size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Enable browser notifications
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
          Get alerted for task assignments, @mentions, and comments
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={dismiss}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Not now
        </button>
        <button
          onClick={requestPermission}
          disabled={loading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'white',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Enabling…' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
