export default function SprintProgressBar({ tasksCount, compact = false }) {
  if (!tasksCount || tasksCount.total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: compact ? 11 : 13, color: 'var(--text-tertiary)', fontWeight: 500 }}>
          No tasks yet
        </span>
      </div>
    )
  }

  const { done = 0, total = 0 } = tasksCount
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0

  let fillColor = '#C47E0A'
  if (percentage >= 90) {
    fillColor = '#2D8653'
  } else if (percentage >= 50) {
    fillColor = '#0F6E56'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!compact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Progress
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {percentage}%
            </span>
          </div>
        )}
        <div style={{
          height: compact ? 6 : 8,
          background: '#F3F0EB',
          borderRadius: 4,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${percentage}%`,
            background: fillColor,
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>
          {done} of {total} task{total !== 1 ? 's' : ''} ({percentage}%)
        </div>
      </div>
    </div>
  )
}
