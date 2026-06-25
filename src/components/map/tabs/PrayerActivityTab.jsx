export function PrayerActivityTab({ logs }) {
  if (logs.length === 0) {
    return (
      <div className="blw-empty-state">
        <p>No prayer activity yet</p>
        <p className="blw-empty-state-hint">Start a prayer session to see activity</p>
      </div>
    )
  }

  return (
    <div className="blw-activity-tab">
      <h3>Prayer Activity Timeline</h3>
      <div className="blw-activity-timeline">
        {logs.map((log, index) => (
          <div key={log.id} className="blw-activity-item">
            <div className="blw-activity-marker">
              <div className="blw-activity-dot" />
              {index < logs.length - 1 && <div className="blw-activity-line" />}
            </div>
            <div className="blw-activity-content">
              <div className="blw-activity-time">
                {formatDateTime(log.logged_at)}
              </div>
              <div className="blw-activity-detail">
                {formatDuration(log.duration_seconds)} of prayer
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="blw-activity-stats">
        <div className="blw-activity-stat">
          <span className="blw-activity-stat-label">Total Sessions:</span>
          <span className="blw-activity-stat-value">{logs.length}</span>
        </div>
        <div className="blw-activity-stat">
          <span className="blw-activity-stat-label">Total Time:</span>
          <span className="blw-activity-stat-value">
            {formatTotalDuration(logs.reduce((sum, l) => sum + l.duration_seconds, 0))}
          </span>
        </div>
        <div className="blw-activity-stat">
          <span className="blw-activity-stat-label">Average Session:</span>
          <span className="blw-activity-stat-value">
            {logs.length > 0
              ? formatDuration(
                  Math.round(logs.reduce((sum, l) => sum + l.duration_seconds, 0) / logs.length)
                )
              : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24))

  if (daysAgo === 0) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  } else if (daysAgo === 1) {
    return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  } else if (daysAgo < 7) {
    return `${daysAgo} days ago`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

function formatTotalDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
