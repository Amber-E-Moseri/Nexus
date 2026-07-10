import { AlertCircle, Check } from 'lucide-react'

/**
 * Alert strip for Flock CRM dashboard surfaces. Pure presentation — the
 * parent owns the (realtime-updated) stats from callFlockCRM('quickStats')
 * and passes them down; renders nothing when there is nothing to flag.
 */
export default function FlockNotificationsSection({ stats }) {
  const alerts = []

  const dueToday = stats?.today || 0
  const overdue = stats?.callbacks || 0

  if (dueToday > 0) {
    alerts.push({
      id: 'due-today',
      type: 'info',
      message: `You have ${dueToday} ${dueToday === 1 ? 'person' : 'people'} due today`,
    })
  }

  if (overdue > 0) {
    alerts.push({
      id: 'overdue',
      type: 'warning',
      message: `${overdue} follow-up${overdue === 1 ? '' : 's'} overdue`,
    })
  }

  if (alerts.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {alerts.map((notif) => (
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
