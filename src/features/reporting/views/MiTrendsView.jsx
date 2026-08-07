import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useMiTrends } from '../hooks/useMiTrends'
import { MI_COLORS } from '../lib/miHelpers'

const SERVICE_COLOR = MI_COLORS.freq3Plus   // purple
const CELL_COLOR    = MI_COLORS.freq3        // teal

export default function MiTrendsView({ dateFrom, dateTo }) {
  const { data: weeks = [], isLoading } = useMiTrends({ dateFrom, dateTo })

  if (isLoading) {
    return <div style={{ padding: 20, color: '#9E9488' }}>Loading trends...</div>
  }

  if (weeks.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#BFBAB0',
        border: '0.5px solid #EDE8DC', borderRadius: 10, marginTop: 8,
      }}>
        No attendance data in this time window
      </div>
    )
  }

  const maxVal = Math.max(...weeks.flatMap(w => [w.service, w.cell]), 1)
  const yDomain = [0, Math.ceil(maxVal * 1.15)]

  return (
    <div>
      <p style={{ fontSize: 12, color: '#9E9488', margin: '0 0 16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Week-over-week attendance — unique members
      </p>

      <div style={{ background: '#fff', border: '0.5px solid #EDE8DC', borderRadius: 12, padding: '20px 8px 12px' }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={weeks} margin={{ top: 4, right: 20, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#EDE8DC" vertical={false} />
            <XAxis
              dataKey="week_label"
              tick={{ fontSize: 10, fill: '#9E9488' }}
              axisLine={{ stroke: '#EDE8DC' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 10, fill: '#9E9488' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EDE8DC', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              formatter={(value, name) => [value, name === 'service' ? 'Service' : 'Cell']}
              labelFormatter={(label) => `Week of ${label}`}
            />
            <Legend
              formatter={(value) => value === 'service' ? 'Service' : 'Cell'}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Line
              type="monotone"
              dataKey="service"
              stroke={SERVICE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: SERVICE_COLOR }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="cell"
              stroke={CELL_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: CELL_COLOR }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats below chart */}
      {weeks.length >= 2 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <TrendSummaryCard label="Avg service/week" value={avg(weeks, 'service')} color={SERVICE_COLOR} />
          <TrendSummaryCard label="Avg cell/week" value={avg(weeks, 'cell')} color={CELL_COLOR} />
          <TrendSummaryCard label="Peak service" value={Math.max(...weeks.map(w => w.service))} color={SERVICE_COLOR} />
          <TrendSummaryCard label="Peak cell" value={Math.max(...weeks.map(w => w.cell))} color={CELL_COLOR} />
        </div>
      )}
    </div>
  )
}

function avg(weeks, key) {
  if (!weeks.length) return 0
  return Math.round(weeks.reduce((s, w) => s + w[key], 0) / weeks.length)
}

function TrendSummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid #EDE8DC',
      borderRadius: 8,
      padding: '10px 16px',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: '#9E9488', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}
