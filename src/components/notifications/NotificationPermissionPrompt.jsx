import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
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

    const dismissed = localStorage.getItem('notification-permission-dismissed')

    if (permission === 'denied') {
      // Only show the "blocked — fix in browser settings" banner if not already dismissed
      if (!dismissed) setDenied(true)
      return
    }

    // permission === 'default': show the enable prompt unless dismissed this session
    if (!dismissed) {
      setTimeout(() => setShow(true), 1500)
    }
  }, [user])

  const dismiss = () => {
    localStorage.setItem('notification-permission-dismissed', 'true')
    setShow(false)
    setDenied(false)
  }

  const requestPermission = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setShow(false)
        new Notification('Notifications enabled', {
          body: 'You will now receive browser notifications from BLW CAN NEXUS',
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

  if (denied) {
    return (
      <div style={{
        padding: '10px 14px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <Bell size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
          Browser notifications are blocked.{' '}
          <strong>Click the lock icon</strong> in your address bar → Notifications → Allow, then reload.
        </p>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  if (!show) return null

  return (
    <div style={{
      padding: '12px 16px',
      backgroundColor: 'var(--accent-muted)',
      borderRadius: '8px',
      marginBottom: '16px',
      border: '1px solid var(--accent)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <Bell size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
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
          }}
        >
          {loading ? 'Enabling…' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
