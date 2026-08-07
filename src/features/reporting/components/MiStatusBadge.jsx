const FS_CONFIG = {
  completed: { label: 'Completed', color: '#1F8A4C', bg: '#E8F5EC' },
  in_progress: { label: 'In progress', color: '#B8710A', bg: '#FBF0DE' },
  not_recorded: { label: 'Not recorded', color: '#9E9488', bg: '#F5F3ED' },
}

export default function MiStatusBadge({ status }) {
  const config = FS_CONFIG[status] || FS_CONFIG.not_recorded
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 500,
      color: config.color,
      background: config.bg,
      whiteSpace: 'nowrap',
    }}>
      {config.label}
    </span>
  )
}
