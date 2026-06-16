// Lightweight inline-SVG line chart — no chart library dependency.
const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 28, left: 36 }

export default function TrendLineChart({ data, title }) {
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom

  const points = data.map((d, i) => {
    const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW
    const pct = d.attendance_pct ?? 0
    const y = PAD.top + innerH - (pct / 100) * innerH
    return { x, y, pct, label: d.month_label, hasData: d.total_meetings > 0 }
  })

  const linePath = points
    .filter((p) => p.hasData)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const gridLines = [0, 25, 50, 75, 100]

  return (
    <div>
      {title && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22', marginBottom: 10 }}>{title}</div>}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Grid lines + y labels */}
        {gridLines.map((g) => {
          const y = PAD.top + innerH - (g / 100) * innerH
          return (
            <g key={g}>
              <line x1={PAD.left} y1={y} x2={WIDTH - PAD.right} y2={y} stroke="#EDE8DC" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 3} fontSize="9" fill="#9E9488" textAnchor="end">{g}%</text>
            </g>
          )
        })}

        {/* Line */}
        {linePath && <path d={linePath} fill="none" stroke="#4C2A92" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Points */}
        {points.filter((p) => p.hasData).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#4C2A92" stroke="white" strokeWidth="1.5" />
        ))}

        {/* X labels */}
        {points.map((p, i) => (
          <text key={i} x={p.x} y={HEIGHT - 8} fontSize="9" fill="#9E9488" textAnchor="middle">{p.label}</text>
        ))}
      </svg>
      {points.every((p) => !p.hasData) && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#9E9488', marginTop: -120 }}>No data for this period.</div>
      )}
    </div>
  )
}
