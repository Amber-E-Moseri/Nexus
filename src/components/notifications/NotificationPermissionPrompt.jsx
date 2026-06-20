import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Bell } from 'lucide-react'

export default function NotificationPermissionPrompt() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window)) return

    const hasAsked = localStorage.getItem('notification-permission-asked')
    if (Notification.permission === 'default' && !hasAsked) {
      // Wait a moment before showing
      setTimeout(() => setShow(true), 1000)
    }
  }, [])

  const requestPermission = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      localStorage.setItem('notification-permission-asked', 'true')

      if (permission === 'granted') {
        setShow(false)
        // Show confirmation notification
        new Notification('Notifications Enabled', {
          body: 'You will now receive browser notifications from BLW CAN NEXUS',
          icon: '/logo.png'
        })
      } else {
        setShow(false)
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err)
    } finally {
      setLoading(false)
    }
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
      gap: '12px'
    }}>
      <Bell size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{
          margin: '0 0 6px 0',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)'
        }}>
          Enable browser notifications
        </p>
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--text-secondary)'
        }}>
          Stay updated with task assignments, comments, and calendar events
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => setShow(false)}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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
            transition: 'all 0.2s'
          }}
        >
          {loading ? 'Enabling...' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
