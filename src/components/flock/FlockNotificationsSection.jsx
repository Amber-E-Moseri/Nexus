import { useEffect, useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'

export default function FlockNotificationsSection() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${FLOCK_CRM_CONFIG.apiUrl}?action=quickStats`)
      if (!response.ok) return

      const data = await response.json()
      const alerts = []

      if (data.today > 0) {
        alerts.push({
          id: 'due-today',
          type: 'info',
          message: `You have ${data.today} people due today`,
          action: 'Open Flock CRM'
        })
      }

      if (data.callbacks > 0) {
        alerts.push({
          id: 'overdue',
          type: 'warning',
          message: `${data.callbacks} follow-up(s) overdue`,
          action: 'View Overdue'
        })
      }

      setNotifications(alerts)
    } catch (error) {
      console.error('Error fetching Flock notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || notifications.length === 0) {
    return null
  }

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {notifications.map((notif) => (
        <div
          key={notif.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: notif.type === 'warning' ? '#FEF0ED' : '#EDE8F8',
            border: `1px solid ${notif.type === 'warning' ? '#F0CBC3' : '#D4C5F9'}`,
          }}
        >
          {notif.type === 'warning' ? (
            <AlertCircle size={14} color="#C94830" />
          ) : (
            <Check size={14} color="#4C2A92" />
          )}
          <span style={{ flex: 1, fontSize: '12px', color: '#2D2A22', fontWeight: 500 }}>
            {notif.message}
          </span>
        </div>
      ))}
    </div>
  )
}
