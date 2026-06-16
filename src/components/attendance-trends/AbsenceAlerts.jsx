const ROLE_LABELS = {
  cell_leader: 'Cell Leader',
  bsc_teacher: 'BSC Teacher',
  coordinator: 'Coordinator',
  leader_in_training: 'Leader in Training',
  leader: 'Leader',
}

export default function AbsenceAlerts({ members }) {
  if (!members.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#9E9488', fontSize: 13, border: '1px dashed #D8D3C9', borderRadius: 12, background: '#FAFAF7' }}>
        No one is on a 2+ meeting absence streak. 🎉
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((m) => (
        <div
          key={m.member_id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            border: '1px solid #F5C4B8', background: '#FEF0ED', borderRadius: 10,
            padding: '10px 14px',
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7A1C24' }}>{m.member_name}</div>
            <div style={{ fontSize: 11.5, color: '#9E5040', marginTop: 2 }}>
              {ROLE_LABELS[m.role] ?? m.role} · Last seen {m.last_meeting_date ? new Date(m.last_meeting_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#C94830', background: 'white', borderRadius: 999, padding: '3px 12px', flexShrink: 0 }}>
            {m.consecutive_absences} in a row
          </span>
        </div>
      ))}
    </div>
  )
}
