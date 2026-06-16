import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const ROLE_LABELS = {
  cell_leader: 'Cell Leader',
  bsc_teacher: 'BSC Teacher',
  coordinator: 'Coordinator',
  leader_in_training: 'Leader in Training',
  leader: 'Leader',
}

function getBarColor(pct) {
  if (pct >= 80) return '#2D8653'
  if (pct >= 65) return '#2D8653'
  if (pct >= 50) return '#E8A020'
  return '#C94830'
}

function RoleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(28,22,16,.08)' }}>
      <div style={{ fontWeight: 700, color: '#2D2A22' }}>{row.role_label}</div>
      <div style={{ color: '#9E9488' }}>{row.present_count}/{row.total_members} · {row.attendance_pct}%</div>
    </div>
  )
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

  const rows = data.map((d) => ({
    ...d,
    role_label: ROLE_LABELS[d.role] ?? d.role,
    attendance_pct: d.attendance_pct ?? 0,
  }))

  return (
    <div>
      {title && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22', marginBottom: 12 }}>{title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <XAxis
            dataKey="role_label"
            tick={{ fontSize: 9, fill: '#9E9488' }}
            axisLine={{ stroke: '#EDE8DC' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: '#9E9488' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<RoleTooltip />} />
          <Bar dataKey="attendance_pct" radius={[4, 4, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.role} fill={getBarColor(row.attendance_pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
