import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const LINE_COLORS = ['#4C2A92', '#2D8653', '#E8A020', '#C94830', '#1C7C9C', '#6B6560']

// Fields that describe the row rather than a plottable series.
const EXCLUDED_KEYS = new Set(['month_label', 'label', 'date', 'total_meetings'])

export default function TrendLineChart({ data, title }) {
  const rows = data ?? []
  const hasData = rows.some((d) => (d.total_meetings ?? 0) > 0)

  // Discover series keys dynamically — supports a single `attendance_pct`
  // series (one subgroup) or multiple subgroup/role-keyed series per row.
  const seriesKeys = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => {
        if (!EXCLUDED_KEYS.has(key) && typeof row[key] === 'number') keys.add(key)
      })
      return keys
    }, new Set()),
  )

  return (
    <div>
      {title && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22', marginBottom: 10 }}>{title}</div>}
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#EDE8DC" vertical={false} />
            <XAxis
              dataKey="month_label"
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
            <Tooltip
              formatter={(value, name) => [`${value}%`, name === 'attendance_pct' ? 'Attendance' : name]}
              labelFormatter={(label) => label}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EDE8DC' }}
            />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key === 'attendance_pct' ? 'Attendance %' : key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3.5, strokeWidth: 1.5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#9E9488', padding: '60px 0' }}>No data for this period.</div>
      )}
    </div>
  )
}
