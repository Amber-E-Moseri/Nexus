function rateBadge(pct) {
  if (pct == null) return { bg: '#F4F1EA', fg: '#9E9488', label: '—' }
  if (pct >= 50) return { bg: '#EEF6F1', fg: '#2D8653', label: `${pct}%` }
  if (pct >= 30) return { bg: '#FFF8EC', fg: '#E8A020', label: `${pct}%` }
  return { bg: '#FEF0ED', fg: '#C94830', label: `${pct}%` }
}

const TH = { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', background: '#F9F7F3', borderBottom: '1px solid #EDE8DC' }
const TD = { padding: '10px 12px', fontSize: 13, color: '#2D2A22', verticalAlign: 'middle', borderBottom: '1px solid #F5F2EC' }

export default function SubgroupRankingTable({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#9E9488', fontSize: 13, border: '1px dashed #D8D3C9', borderRadius: 12, background: '#FAFAF7' }}>
        No subgroup data for this meeting type / period.
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #EDE8DC', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 50 }}>Rank</th>
            <th style={TH}>Subgroup</th>
            <th style={{ ...TH, textAlign: 'right' }}>Meetings</th>
            <th style={{ ...TH, textAlign: 'right' }}>Attendance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = rateBadge(r.attendance_pct)
            return (
              <tr key={r.subgroup_id}>
                <td style={{ ...TD, color: '#9E9488', fontWeight: 700 }}>#{r.rank}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.subgroup_name}</td>
                <td style={{ ...TD, textAlign: 'right', color: '#9E9488' }}>{r.total_meetings}</td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: badge.bg, color: badge.fg }}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
