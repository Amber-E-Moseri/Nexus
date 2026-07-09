import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const MUTED = 'var(--ink-3)'

export default function OpenRateChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} />
        <YAxis unit="%" tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip formatter={(value) => [`${value}%`, 'Open Rate']} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDER}` }} />
        <Line type="monotone" dataKey="openRate" stroke={PRIMARY} strokeWidth={2} dot={{ r: 4, fill: PRIMARY }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
