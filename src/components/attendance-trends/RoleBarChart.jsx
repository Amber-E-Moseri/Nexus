const ROLE_LABELS = {
  cell_leader: 'Cell Leader',
  bsc_teacher: 'BSC Teacher',
  coordinator: 'Coordinator',
  leader_in_training: 'Leader in Training',
  leader: 'Leader',
}

const ROLE_COLORS = {
  cell_leader: '#4C2A92',
  bsc_teacher: '#2D8653',
  coordinator: '#E8A020',
  leader_in_training: '#C94830',
  leader: '#6B6560',
}

export default function RoleBarChart({ data, title }) {
  if (!data.length) {
    return (
      <div>
        {title && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22', marginBottom: 10 }}>{title}</div>}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#9E9488', padding: '24px 0' }}>No role data available.</div>
      </div>
    )
  }

  return (
    <div>
      {title && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22', marginBottom: 12 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.map((d) => {
          const pct = d.attendance_pct ?? 0
          const color = ROLE_COLORS[d.role] ?? '#4C2A92'
          return (
            <div key={d.role}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#2D2A22', fontWeight: 600 }}>{ROLE_LABELS[d.role] ?? d.role}</span>
                <span style={{ color: '#9E9488' }}>{d.present_count}/{d.total_members} · {pct}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: '#F4F1EA', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
