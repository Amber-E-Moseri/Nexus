import { useState, useEffect, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { TrendingUp, Trash2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

// ── Design tokens (matches Registration ecosystem) ─────────────────────────────
const C = {
  ink:        '#1A1220',
  purple:     '#4C2A92',
  purpleDeep: '#37206C',
  purpleBg:   '#F1EEF6',
  cream:      '#FAFAF8',
  paper:      '#FFFFFF',
  line:       '#E7E2EE',
  mute:       '#8A7F99',
  green:      '#1F8A4C',
  greenBg:    '#E8F5EC',
  amber:      '#B8710A',
  amberBg:    '#FBF0DE',
  red:        '#C4383A',
  redBg:      '#FBE9E9',
  blue:       '#2A5FA5',
  blueBg:     '#E9F0FA',
}

const CHART_COLORS = [
  '#4C2A92','#2A5FA5','#1F8A4C','#B8710A','#C4383A','#0891b2',
  '#7c3aed','#65a30d','#c026d3','#0f766e','#9333ea','#b45309',
  '#be123c','#1d4ed8','#15803d','#b91c1c','#6d28d9',
]

const STATUS_META = {
  reported:     { label: 'Reported',      color: C.green,  bg: C.greenBg,  dot: '●' },
  merged:       { label: 'Merged',        color: C.amber,  bg: C.amberBg,  dot: '●' },
  did_not_meet: { label: 'Did Not Meet',  color: C.mute,   bg: '#F5F4F7',  dot: '●' },
  missing:      { label: 'Missing',       color: C.red,    bg: C.redBg,    dot: '●' },
  current:      { label: 'In Progress',   color: C.blue,   bg: C.blueBg,   dot: '●' },
}

// ── Shared UI primitives ───────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, ...style }}>
      {children}
    </div>
  )
}

function Pill({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.missing
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 700, padding: '3px 9px',
      borderRadius: 20, letterSpacing: 0.2, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 7 }}>{m.dot}</span>
      {m.label}
    </span>
  )
}

function Btn({ children, onClick, tone = 'primary', small, disabled }) {
  const styles = {
    primary: { background: C.purple,  color: '#fff',   border: `1px solid ${C.purple}` },
    ghost:   { background: C.paper,   color: C.purple, border: `1px solid ${C.line}` },
    subtle:  { background: C.purpleBg,color: C.purpleDeep, border: '1px solid transparent' },
    danger:  { background: C.redBg,   color: C.red,    border: `1px solid transparent` },
  }[tone] ?? {}
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles,
      fontFamily: 'Inter', fontWeight: 600,
      fontSize: small ? 12 : 13.5,
      padding: small ? '5px 11px' : '8px 16px',
      borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      transition: 'opacity .15s',
    }}>
      {children}
    </button>
  )
}

const TH = ({ children, right }) => (
  <th style={{
    padding: '9px 14px', textAlign: right ? 'right' : 'left',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
    letterSpacing: '0.05em', textTransform: 'uppercase',
    color: C.mute, fontWeight: 600, borderBottom: `1px solid ${C.line}`,
    background: C.cream,
  }}>{children}</th>
)

const TD = ({ children, right, bold, color, extra }) => (
  <td style={{
    padding: '10px 14px', textAlign: right ? 'right' : 'left',
    borderBottom: `1px solid ${C.line}`, fontSize: 13,
    fontWeight: bold ? 600 : 400, color: color,
    ...extra,
  }}>{children}</td>
)

function Label({ children }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      color: C.mute, fontWeight: 600, marginBottom: 4,
    }}>{children}</div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', style }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{
      padding: '8px 11px', borderRadius: 8, border: `1px solid ${C.line}`,
      fontSize: 13, fontFamily: 'Inter', color: C.ink,
      background: C.paper, width: '100%', boxSizing: 'border-box', outline: 'none',
      ...style,
    }} />
  )
}

function Select({ value, onChange, children, style }) {
  return (
    <select value={value} onChange={onChange} style={{
      padding: '8px 11px', borderRadius: 8, border: `1px solid ${C.line}`,
      fontSize: 13, fontFamily: 'Inter', color: C.ink,
      background: C.paper, outline: 'none', cursor: 'pointer',
      ...style,
    }}>
      {children}
    </select>
  )
}

function StatCard({ label, value, sub, subColor }) {
  return (
    <Card style={{ padding: '18px 22px', flex: '1 1 160px' }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: C.ink, marginTop: 6 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: subColor ?? C.mute, marginTop: 3, fontFamily: 'Inter' }}>{sub}</div>}
    </Card>
  )
}

function formatWeek(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function formatWeekFull(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Print/PDF helper (client-side) ─────────────────────────────────────────────

function buildChartSVG(growthData, activeWeek) {
  const allWeeks = [...new Set(growthData.map(r => r.week_start_date))].sort()
  const chartWeeks = allWeeks.slice(-12)
  if (chartWeeks.length < 2) return ''

  const fmtLbl = dateStr => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  }

  const points = chartWeeks.map(week => {
    const weekRows = growthData.filter(r => r.week_start_date === week && r.status === 'reported')
    return { week, label: fmtLbl(week), total: weekRows.length > 0 ? weekRows.reduce((s, r) => s + r.total_attendance, 0) : null }
  })

  const W = 680, H = 200
  const pad = { top: 24, right: 16, bottom: 36, left: 44 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom
  const n = points.length

  const vals = points.filter(p => p.total != null).map(p => p.total)
  if (vals.length === 0) return ''
  const rawMax = Math.max(...vals)
  const niceMax = Math.ceil(rawMax / 10) * 10 || 10

  const xOf = i => pad.left + (i / (n - 1)) * cW
  const yOf = v => pad.top + cH - (v / niceMax) * cH

  const tickCount = 4
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = Math.round((niceMax * i) / tickCount)
    return { v, y: yOf(v) }
  })

  // Build polyline path, breaking on null gaps
  let pathSegs = ''
  let seg = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.total != null) {
      seg.push(`${xOf(i).toFixed(1)},${yOf(p.total).toFixed(1)}`)
    } else {
      if (seg.length > 1) pathSegs += `<polyline points="${seg.join(' ')}" fill="none" stroke="#4C2A92" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
      seg = []
    }
  }
  if (seg.length > 1) pathSegs += `<polyline points="${seg.join(' ')}" fill="none" stroke="#4C2A92" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`

  // Active week dashed highlight
  const activeIdx = points.findIndex(p => p.week === activeWeek)
  const refLine = activeIdx >= 0
    ? `<line x1="${xOf(activeIdx).toFixed(1)}" y1="${pad.top}" x2="${xOf(activeIdx).toFixed(1)}" y2="${pad.top + cH}" stroke="#4C2A92" stroke-width="1" stroke-dasharray="4 3"/>`
    : ''

  return `<div style="margin:20px 0 24px;">
<div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A7F99;font-weight:700;margin-bottom:6px;">Network Attendance — Last ${n} Weeks</div>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;font-family:system-ui,sans-serif;overflow:visible;">
  ${yTicks.map(t => `<line x1="${pad.left}" y1="${t.y.toFixed(1)}" x2="${W - pad.right}" y2="${t.y.toFixed(1)}" stroke="#E7E2EE" stroke-width="1"/>
  <text x="${(pad.left - 5).toFixed(1)}" y="${(t.y + 3.5).toFixed(1)}" text-anchor="end" font-size="8.5" fill="#8A7F99">${t.v}</text>`).join('')}
  ${refLine}
  ${pathSegs}
  ${points.map((p, i) => p.total != null ? `
  <circle cx="${xOf(i).toFixed(1)}" cy="${yOf(p.total).toFixed(1)}" r="${p.week === activeWeek ? 4.5 : 3}" fill="${p.week === activeWeek ? '#4C2A92' : '#7C5CCC'}" stroke="white" stroke-width="1.5"/>
  <text x="${xOf(i).toFixed(1)}" y="${(yOf(p.total) - 7).toFixed(1)}" text-anchor="middle" font-size="8" fill="#4C2A92" font-weight="600">${p.total}</text>` : '').join('')}
  ${points.map((p, i) => `<text x="${xOf(i).toFixed(1)}" y="${(H - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#8A7F99">${p.label}</text>`).join('')}
</svg>
</div>`
}

function buildPrintHTML(weekLabel, rows, growthData, activeWeek) {
  const f    = n => n == null ? '—' : Number(n).toLocaleString()
  const d    = n => n == null ? '—' : n >= 0 ? `+${n}` : String(n)
  const icon = { reported: '🟢', merged: '🟡', did_not_meet: '⚪', missing: '🔴', current: '🔵' }
  const sl   = { reported: 'Reported', merged: 'Merged', did_not_meet: 'Did Not Meet', missing: 'Missing', current: 'In Progress' }
  const reported = rows.filter(r => r.status === 'reported')
  const netTotal = reported.reduce((s, r) => s + r.total_attendance, 0)
  const netFT    = reported.reduce((s, r) => s + r.first_timers, 0)
  const netDelta = reported.reduce((s, r) => s + (r.wow_delta ?? 0), 0)
  const sorted   = [...rows].sort((a, b) => b.total_attendance - a.total_attendance)
  const chartSVG = growthData ? buildChartSVG(growthData, activeWeek) : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>BLW Canada Growth Report – ${weekLabel}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1a1220; background: white; margin: 0; padding: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8A7F99; font-weight: 700; margin: 0 0 8px; }
  .sub { color: #8A7F99; font-size: 12px; margin: 0 0 24px; }
  hr { border: none; border-top: 1px solid #E7E2EE; margin: 16px 0; }
  .stats { display: flex; gap: 40px; margin: 0 0 20px; }
  .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #8A7F99; font-weight: 700; }
  .stat-value { font-size: 26px; font-weight: 700; margin: 4px 0 2px; }
  .stat-sub { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #8A7F99; font-weight: 700; border-bottom: 2px solid #4C2A92; }
  th.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #E7E2EE; }
  td.r { text-align: right; }
  .g { color: #1F8A4C; } .r2 { color: #C4383A; } .mu { color: #8A7F99; }
  footer { font-size: 10px; color: #8A7F99; margin-top: 20px; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<div class="eyebrow">BLW Canada</div>
<h1>Weekly Growth Report</h1>
<p class="sub">Week of ${weekLabel}</p>
<hr>
<div class="stats">
  <div><div class="stat-label">Network Attendance</div><div class="stat-value">${f(netTotal)}</div><div class="stat-sub ${netDelta >= 0 ? 'g' : 'r2'}">${d(netDelta)} vs prev week</div></div>
  <div><div class="stat-label">First-Timers</div><div class="stat-value">${f(netFT)}</div></div>
  <div><div class="stat-label">Centers Reporting</div><div class="stat-value">${reported.length}<span style="font-size:15px;color:#8A7F99;"> / ${rows.length}</span></div></div>
</div>
${chartSVG}
<table>
  <thead><tr>
    <th>Center</th><th class="r">Attendance</th><th class="r">1st-Timers</th>
    <th class="r">WoW</th><th class="r">4-Wk Avg</th><th class="r">Status</th>
  </tr></thead>
  <tbody>${sorted.map(r => `<tr>
    <td>${icon[r.status] ?? ''} ${r.church_name}</td>
    <td class="r">${r.status === 'reported' ? f(r.total_attendance) : '—'}</td>
    <td class="r">${r.status === 'reported' ? f(r.first_timers) : '—'}</td>
    <td class="r ${r.status === 'reported' && r.wow_delta != null ? (r.wow_delta >= 0 ? 'g' : 'r2') : 'mu'}">${r.status === 'reported' && r.wow_delta != null ? d(r.wow_delta) : '—'}</td>
    <td class="r mu">${f(r.rolling_avg_4wk)}</td>
    <td class="r mu">${sl[r.status] ?? r.status}</td>
  </tr>`).join('')}</tbody>
</table>
<footer>🟢 Reported · 🟡 Merged · ⚪ Did Not Meet · 🔴 Missing &nbsp;|&nbsp; WoW = week-over-week · 4-Wk Avg = rolling 4-week average</footer>
</body></html>`
}

function downloadReport(activeWeek, activeRows, growthData) {
  const html = buildPrintHTML(formatWeekFull(activeWeek), activeRows, growthData, activeWeek)
  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) { alert('Allow popups to download the report.'); return }
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 400)
}

// ── Dashboard tab ──────────────────────────────────────────────────────────────

function Dashboard({ growthData, loading, selectedWeek, onWeekChange }) {
  const [selectedCenter, setSelectedCenter] = useState('all')
  const [weekCount, setWeekCount] = useState(12)

  if (loading) return (
    <div style={{ padding: 64, textAlign: 'center', color: C.mute, fontFamily: 'Inter' }}>
      Loading growth data…
    </div>
  )

  if (!growthData.length) return (
    <Card style={{ padding: 64, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 8, color: C.ink }}>
        No data yet
      </div>
      <div style={{ color: C.mute, fontSize: 14, fontFamily: 'Inter' }}>
        Go to Settings → run a sync to populate growth data.
      </div>
    </Card>
  )

  const allWeeks = [...new Set(growthData.map(r => r.week_start_date))].sort()
  const chartWeeks = allWeeks.slice(-weekCount)
  const centers = [...new Set(growthData.map(r => r.church_name))].sort()
  const showAll = selectedCenter === 'all'

  // Resolve which week the table/stats show
  const activeWeek = selectedWeek ?? allWeeks[allWeeks.length - 1]
  const activeWeekIdx = allWeeks.indexOf(activeWeek)
  const isLatest = activeWeek === allWeeks[allWeeks.length - 1]
  const isOldest = activeWeek === allWeeks[0]

  const chartData = chartWeeks.map(week => {
    const entry = { week: formatWeek(week), weekFull: formatWeekFull(week), weekKey: week }
    if (showAll) {
      const weekRows = growthData.filter(r => r.week_start_date === week && r.status === 'reported')
      entry['Network Total'] = weekRows.length > 0
        ? weekRows.reduce((s, r) => s + r.total_attendance, 0)
        : null
    } else {
      const row = growthData.find(r => r.week_start_date === week && r.church_name === selectedCenter)
      entry[selectedCenter] = row?.status === 'reported' ? row.total_attendance : null
    }
    return entry
  })

  // Stats + table for the active (selected) week
  const activeRows = growthData.filter(r => r.week_start_date === activeWeek)
  const networkTotal   = activeRows.filter(r => r.status === 'reported').reduce((s, r) => s + r.total_attendance, 0)
  const networkFT      = activeRows.filter(r => r.status === 'reported').reduce((s, r) => s + r.first_timers, 0)
  const networkDelta   = activeRows.filter(r => r.status === 'reported').reduce((s, r) => s + (r.wow_delta ?? 0), 0)
  const reportingCount = activeRows.filter(r => r.status === 'reported').length
  const maxAttendance  = Math.max(...activeRows.filter(r => r.status === 'reported').map(r => r.total_attendance), 1)

  // The ReferenceLine xAxisId value must match the XAxis dataKey label
  const refLabel = formatWeek(activeWeek)

  const navBtn = (disabled, onClick, icon) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: 32, height: 32, borderRadius: 8,
      border: `1px solid ${C.line}`, background: C.paper,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? C.line : C.ink, flexShrink: 0,
    }}>
      {icon}
    </button>
  )

  return (
    <div>
      {/* Week navigator — drives stats, chips, and table */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {navBtn(isOldest, () => onWeekChange(allWeeks[activeWeekIdx - 1]), <ChevronLeft size={16} />)}
        <select
          value={activeWeek}
          onChange={e => onWeekChange(e.target.value)}
          style={{
            padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.line}`,
            fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
            color: C.ink, background: C.paper, cursor: 'pointer', outline: 'none',
          }}
        >
          {[...allWeeks].reverse().map(w => (
            <option key={w} value={w}>
              Week of {formatWeekFull(w)}{w === allWeeks[allWeeks.length - 1] ? ' (current)' : ''}
            </option>
          ))}
        </select>
        {navBtn(isLatest, () => onWeekChange(allWeeks[activeWeekIdx + 1]), <ChevronRight size={16} />)}
        {!isLatest && (
          <button
            onClick={() => onWeekChange(null)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.purple}`,
              background: C.purpleBg, color: C.purple,
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter', cursor: 'pointer',
            }}
          >
            Back to current
          </button>
        )}
        {/* Download PDF — opens browser print dialog for save-as-PDF */}
        <button
          onClick={() => downloadReport(activeWeek, activeRows, growthData)}
          title="Open print dialog to save as PDF"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8,
            border: `1px solid ${C.line}`, background: C.paper, color: C.mute,
            fontSize: 12, fontWeight: 600, fontFamily: 'Inter', cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF
        </button>
      </div>

      {/* Network stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard
          label="Network Attendance"
          value={networkTotal.toLocaleString()}
          sub={networkDelta !== 0
            ? `${networkDelta >= 0 ? '↑' : '↓'} ${Math.abs(networkDelta)} vs prev week`
            : '→ same as prev week'}
          subColor={networkDelta > 0 ? C.green : networkDelta < 0 ? C.red : C.mute}
        />
        <StatCard label="First-Timers" value={networkFT.toLocaleString()} sub="this week" />
        {/* Reporting card with progress bar */}
        <Card style={{ padding: '18px 22px', flex: '1 1 160px', position: 'relative', overflow: 'hidden' }}>
          <Label>Reporting</Label>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: C.ink, marginTop: 6 }}>
            {reportingCount}
            <span style={{ fontSize: 18, color: C.mute, fontWeight: 400 }}> / {activeRows.length}</span>
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 3, fontFamily: 'Inter' }}>service centers</div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
            background: C.line, borderRadius: '0 0 14px 14px',
          }}>
            <div style={{
              height: '100%',
              width: `${activeRows.length > 0 ? Math.round((reportingCount / activeRows.length) * 100) : 0}%`,
              background: reportingCount === activeRows.length ? C.green : C.purple,
              borderRadius: '0 0 0 14px',
              transition: 'width .4s ease',
            }} />
          </div>
        </Card>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_META).filter(([k]) => k !== 'current').map(([key, meta]) => {
          const count = activeRows.filter(r => r.status === key).length
          if (count === 0) return null
          return (
            <span key={key} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: meta.bg, color: meta.color,
              fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 20,
              fontFamily: 'Inter',
            }}>
              <span style={{ fontSize: 7 }}>●</span>
              {count} {meta.label}
            </span>
          )
        })}
      </div>

      {/* Chart controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Select value={selectedCenter} onChange={e => setSelectedCenter(e.target.value)} style={{ flex: '0 0 auto' }}>
          <option value="all">All centers — network total</option>
          {centers.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={weekCount} onChange={e => setWeekCount(Number(e.target.value))} style={{ flex: '0 0 auto' }}>
          {[8, 12, 20, 52].map(n => <option key={n} value={n}>Last {n} weeks</option>)}
        </Select>
      </div>

      {/* Chart — reference line highlights the selected review week */}
      <Card style={{ padding: 20, marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.mute, fontFamily: 'Inter' }} />
            <YAxis tick={{ fontSize: 11, fill: C.mute, fontFamily: 'Inter' }} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 9, border: `1px solid ${C.line}`, fontFamily: 'Inter' }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.weekFull ?? ''}
            />
            {chartWeeks.includes(activeWeek) && (
              <ReferenceLine
                x={refLabel}
                stroke={C.purple}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: 'viewing', position: 'top', fontSize: 10, fill: C.purple, fontFamily: 'Inter' }}
              />
            )}
            {showAll ? (
              <Line type="monotone" dataKey="Network Total" stroke={C.purple} strokeWidth={2.5} dot={{ r: 3.5, fill: C.purple }} connectNulls={false} name="Network Total" />
            ) : (
              <Line type="monotone" dataKey={selectedCenter} stroke={C.purple} strokeWidth={2.5} dot={{ r: 3.5, fill: C.purple }} connectNulls={false} name={selectedCenter} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Per-center table for selected week */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: C.ink }}>
          Week of {formatWeekFull(activeWeek)}
        </div>
        <div style={{ fontSize: 12, color: C.mute, fontFamily: 'Inter' }}>
          {reportingCount} of {activeRows.length} reporting
        </div>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Center</TH>
                <TH right>Attendance</TH>
                <TH right>1st-Timers</TH>
                <TH right>WoW</TH>
                <TH right>4-Wk Avg</TH>
                <TH right>Status</TH>
              </tr>
            </thead>
            <tbody>
              {[...activeRows].sort((a, b) => b.total_attendance - a.total_attendance).map(row => {
                const zeroCheckin  = row.status === 'reported' && row.total_attendance === 0
                const statusColor  = zeroCheckin ? C.amber : (STATUS_META[row.status]?.color ?? C.mute)
                const attPct = row.status === 'reported' && !zeroCheckin
                  ? Math.round((row.total_attendance / maxAttendance) * 100)
                  : 0
                return (
                  <tr key={row.church_name} className="growth-row" style={{ background: C.paper }}>
                    <TD bold extra={{ borderLeft: `3px solid ${statusColor}`, paddingLeft: 11 }}>
                      {row.church_name}
                    </TD>
                    <TD right bold color={zeroCheckin ? C.amber : C.ink} extra={{
                      background: attPct > 0
                        ? `linear-gradient(to left, ${C.purpleBg} ${attPct}%, transparent ${attPct}%)`
                        : undefined,
                    }}>
                      {row.status === 'reported'
                        ? zeroCheckin ? '⚠ 0' : row.total_attendance.toLocaleString()
                        : '—'}
                    </TD>
                    <TD right>
                      {row.status === 'reported' ? row.first_timers.toLocaleString() : '—'}
                    </TD>
                    <TD right color={row.status === 'reported' && row.wow_delta != null
                      ? (row.wow_delta > 0 ? C.green : row.wow_delta < 0 ? C.red : C.mute)
                      : C.mute}>
                      {row.status === 'reported' && row.wow_delta != null
                        ? `${row.wow_delta > 0 ? '↑' : row.wow_delta < 0 ? '↓' : '→'} ${Math.abs(row.wow_delta)}`
                        : '—'}
                    </TD>
                    <TD right color={C.mute}>{row.rolling_avg_4wk ?? '—'}</TD>
                    <TD right>
                      {zeroCheckin
                        ? <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: C.amberBg, color: C.amber,
                            fontSize: 11, fontWeight: 700, padding: '3px 9px',
                            borderRadius: 20, letterSpacing: 0.2, whiteSpace: 'nowrap',
                          }}>
                            <span style={{ fontSize: 7 }}>●</span> Verify
                          </span>
                        : <Pill status={row.status} />}
                    </TD>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────

function Settings({ schedule, recipients, weekStatuses, onRefresh, onSync, syncing }) {
  const { profile } = useAuth()
  const [newEmail, setNewEmail] = useState('')
  const [flagCenter, setFlagCenter] = useState('')
  const [flagWeek, setFlagWeek] = useState('')
  const [flagStatus, setFlagStatus] = useState('merged')
  const [flagNote, setFlagNote] = useState('')
  const [flagSaving, setFlagSaving] = useState(false)
  const [gapFilling, setGapFilling] = useState(false)
  const [gapResult, setGapResult] = useState(null)

  useEffect(() => {
    const d = new Date()
    const day = d.getDay()
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    setFlagWeek(d.toISOString().split('T')[0])
  }, [])

  async function toggleActive(id, current) {
    await supabase.from('service_center_schedule').update({ active: !current }).eq('id', id)
    onRefresh()
  }

  async function addRecipient() {
    if (!newEmail.trim()) return
    await supabase.from('report_recipients').insert({ email: newEmail.trim().toLowerCase() })
    setNewEmail('')
    onRefresh()
  }

  async function toggleRecipient(id, current) {
    await supabase.from('report_recipients').update({ active: !current }).eq('id', id)
    onRefresh()
  }

  async function removeRecipient(id) {
    await supabase.from('report_recipients').delete().eq('id', id)
    onRefresh()
  }

  async function saveFlag() {
    if (!flagCenter || !flagWeek) return
    setFlagSaving(true)
    await supabase.from('service_center_week_status').upsert({
      schedule_id:     flagCenter,
      week_start_date: flagWeek,
      status:          flagStatus,
      note:            flagNote || null,
      set_by:          profile?.id ?? null,
      set_at:          new Date().toISOString(),
    }, { onConflict: 'schedule_id,week_start_date' })
    setFlagNote('')
    setFlagSaving(false)
    onRefresh()
  }

  async function runFillGaps() {
    const from = document.getElementById('gap-from').value
    const to   = document.getElementById('gap-to').value
    if (!from || !to) return
    setGapFilling(true)
    setGapResult(null)
    const { data, error } = await supabase.rpc('fill_center_gaps', { p_from: from, p_to: to })
    setGapFilling(false)
    setGapResult(error ? { error: error.message } : data)
    setTimeout(() => setGapResult(null), 8000)
    onRefresh()
  }

  async function removeFlag(id) {
    await supabase.from('service_center_week_status').delete().eq('id', id)
    onRefresh()
  }

  const section = { marginBottom: 24 }
  const sectionTitle = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 14 }
  const fieldLabel = { display: 'block', marginBottom: 6 }

  return (
    <div style={{ maxWidth: 700 }}>

      {/* Sync */}
      <div style={section}>
        <div style={sectionTitle}>Data Sync</div>
        <Card style={{ padding: 22 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.mute, fontFamily: 'Inter', lineHeight: 1.6 }}>
            Auto-syncs Sunday at 8:50 PM ET and Monday at 9:00 AM ET (catch-up for late submissions).
            Use the Sync button in the header for a quick on-demand refresh, or backfill a specific date range below.
          </p>
          <details>
            <summary style={{ fontSize: 13, cursor: 'pointer', color: C.purple, fontFamily: 'Inter', fontWeight: 600 }}>
              Backfill a date range
            </summary>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <Label>From</Label>
                <Input type="date" id="bf-from" defaultValue="2026-01-01" style={{ width: 'auto' }} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" id="bf-to" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: 'auto' }} />
              </div>
              <Btn tone="ghost" disabled={syncing} onClick={() => {
                const from = document.getElementById('bf-from').value
                const to   = document.getElementById('bf-to').value
                onSync(from, to)
              }}>
                {syncing ? 'Running…' : 'Run backfill'}
              </Btn>
            </div>
          </details>
        </Card>
      </div>

      {/* Fill inactive center gaps */}
      <div style={section}>
        <div style={sectionTitle}>Fill Inactive Center Gaps</div>
        <Card style={{ padding: 22 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.mute, fontFamily: 'Inter', lineHeight: 1.6 }}>
            For currently-inactive service centers, generates <em>Did Not Meet</em> entries for any week in the
            range where they have no report data. This prevents those weeks from showing as "Missing" if the center
            reactivates. The auto-sync does this automatically on reactivation, but you can run it here manually
            for any date range.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <Label>From</Label>
              <Input type="date" id="gap-from" defaultValue="2026-01-01" style={{ width: 'auto' }} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" id="gap-to" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: 'auto' }} />
            </div>
            <Btn tone="ghost" disabled={gapFilling} onClick={runFillGaps}>
              {gapFilling ? 'Filling…' : 'Fill gaps'}
            </Btn>
          </div>
          {gapResult && (
            <div style={{ marginTop: 12, fontSize: 13, fontFamily: 'Inter', color: gapResult.error ? C.red : C.green }}>
              {gapResult.error
                ? `Error: ${gapResult.error}`
                : `✓ Created ${gapResult[0]?.created_count ?? 0} entries across ${gapResult[0]?.centers_affected ?? 0} center(s)`}
            </div>
          )}
        </Card>
      </div>

      {/* Week flags */}
      <div style={section}>
        <div style={sectionTitle}>Flag a Week</div>
        <Card style={{ padding: 22 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.mute, fontFamily: 'Inter', lineHeight: 1.6 }}>
            Mark a service center as merged (combined with another service) or did not meet for a specific Sunday week.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <Label style={fieldLabel}>Center</Label>
              <Select value={flagCenter} onChange={e => setFlagCenter(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select center…</option>
                {schedule.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.church_name}</option>)}
              </Select>
            </div>
            <div>
              <Label style={fieldLabel}>Week (Monday)</Label>
              <Input type="date" value={flagWeek} onChange={e => setFlagWeek(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 18 }}>
            <div>
              <Label style={fieldLabel}>Status</Label>
              <Select value={flagStatus} onChange={e => setFlagStatus(e.target.value)} style={{ width: '100%' }}>
                <option value="merged">Merged</option>
                <option value="did_not_meet">Did Not Meet</option>
              </Select>
            </div>
            <div>
              <Label style={fieldLabel}>Note (optional)</Label>
              <Input value={flagNote} onChange={e => setFlagNote(e.target.value)} placeholder="e.g. Merged with YorkU for homecoming weekend" />
            </div>
          </div>
          <Btn onClick={saveFlag} disabled={!flagCenter || !flagWeek || flagSaving}>
            {flagSaving ? 'Saving…' : 'Save flag'}
          </Btn>

          {weekStatuses.length > 0 && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.mute, fontWeight: 600, marginBottom: 10 }}>
                Active flags
              </div>
              {weekStatuses.map(ws => {
                const center = schedule.find(s => s.id === ws.schedule_id)
                const meta = STATUS_META[ws.status]
                return (
                  <div key={ws.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13, fontFamily: 'Inter' }}>
                    <span style={{ flex: 1 }}>
                      <strong>{center?.church_name ?? ws.schedule_id}</strong>
                      <span style={{ color: C.mute }}> · {formatWeekFull(ws.week_start_date)} · </span>
                      <Pill status={ws.status} />
                      {ws.note && <span style={{ color: C.mute, marginLeft: 8 }}>{ws.note}</span>}
                    </span>
                    <Btn tone="ghost" small onClick={() => removeFlag(ws.id)}>Remove</Btn>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Service Centers */}
      <div style={section}>
        <div style={sectionTitle}>Service Centers</div>
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Name</TH>
                <TH>Unit ID</TH>
                <TH right>Active</TH>
              </tr>
            </thead>
            <tbody>
              {schedule.map(s => (
                <tr key={s.id}>
                  <TD bold>{s.church_name}</TD>
                  <TD><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.mute }}>{s.church_unit_id}</span></TD>
                  <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.line}` }}>
                    <button onClick={() => toggleActive(s.id, s.active)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.active ? C.green : C.mute, display: 'inline-flex' }}>
                      {s.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Recipients */}
      <div style={section}>
        <div style={sectionTitle}>Report Recipients</div>
        <Card style={{ padding: 22 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.mute, fontFamily: 'Inter', lineHeight: 1.6 }}>
            These addresses receive the automated Sunday 7:45 PM ET growth report.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addRecipient()} />
            <Btn onClick={addRecipient} disabled={!newEmail.trim()}>Add</Btn>
          </div>
          {recipients.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.line}`, fontSize: 13, fontFamily: 'Inter' }}>
              <span style={{ flex: 1, color: r.active ? C.ink : C.mute, textDecoration: r.active ? 'none' : 'line-through' }}>{r.email}</span>
              <Btn tone="ghost" small onClick={() => toggleRecipient(r.id, r.active)}>{r.active ? 'Pause' : 'Resume'}</Btn>
              <button onClick={() => removeRecipient(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, display: 'inline-flex', padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ── Month End tab ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function MonthEnd({ growthData, schedule, onRefresh }) {
  const now = new Date()
  const defaultMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const [month, setMonth]       = useState(defaultMonth)
  const [year, setYear]         = useState(defaultYear)
  const [marking, setMarking]   = useState(false)
  const [markResult, setMarkResult] = useState(null)

  // ISO week-start Mondays whose Monday falls within the selected month
  const monthWeeks = useMemo(() => {
    const result = []
    const firstDay = new Date(year, month, 1)
    const dow = firstDay.getDay()
    const startMonday = new Date(firstDay)
    startMonday.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1))
    const lastDay = new Date(year, month + 1, 0)
    let cur = new Date(startMonday)
    while (cur <= lastDay) {
      result.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 7)
    }
    return result
  }, [year, month])

  const activeSchedule = useMemo(() => schedule.filter(s => s.active), [schedule])

  const matrix = useMemo(() =>
    activeSchedule.map(center => {
      const weekData = monthWeeks.map(week => {
        const row = growthData.find(r => r.schedule_id === center.id && r.week_start_date === week)
        return { week, status: row?.status ?? null, attendance: row?.total_attendance ?? null }
      })
      const missing  = weekData.filter(w => w.status === 'missing').length
      const reported = weekData.filter(w => w.status === 'reported').length
      return { center, weekData, missing, reported }
    }),
  [activeSchedule, monthWeeks, growthData])

  const totalMissing       = matrix.reduce((s, r) => s + r.missing, 0)
  const centersWithMissing = matrix.filter(r => r.missing > 0)
  const fullyReported      = matrix.filter(r => r.missing === 0 && r.reported === monthWeeks.length).length

  async function markAllMissing() {
    if (centersWithMissing.length === 0) return
    setMarking(true)
    setMarkResult(null)
    const unitIds  = centersWithMissing.map(m => m.center.church_unit_id)
    const fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const toDate   = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const { data, error } = await supabase.rpc('fill_center_gaps', { p_from: fromDate, p_to: toDate, p_unit_ids: unitIds })
    setMarking(false)
    setMarkResult(error ? { error: error.message } : data)
    setTimeout(() => setMarkResult(null), 6000)
    onRefresh()
  }

  const CellIcon = ({ status, attendance }) => {
    if (status === 'reported' && attendance === 0)
      return <span style={{ color: C.amber, fontSize: 13, fontWeight: 700 }} title="Reported but 0 check-ins">⚠</span>
    const icons = {
      reported:     { char: '✓', color: C.green  },
      merged:       { char: '~', color: C.amber  },
      did_not_meet: { char: '○', color: C.mute   },
      missing:      { char: '✗', color: C.red    },
      current:      { char: '…', color: C.blue   },
    }
    const m = status ? icons[status] : null
    return m
      ? <span style={{ color: m.color, fontSize: 13, fontWeight: 700 }}>{m.char}</span>
      : <span style={{ color: C.line }}>—</span>
  }

  const availableYears = []
  for (let y = 2026; y <= now.getFullYear(); y++) availableYears.push(y)

  return (
    <div>
      {/* Month picker + action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ flex: '0 0 auto' }}>
          {MONTH_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
        </Select>
        <Select value={year} onChange={e => setYear(Number(e.target.value))} style={{ flex: '0 0 auto' }}>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {markResult && !markResult.error && (
            <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
              ✓ {markResult[0]?.created_count ?? 0} entries marked as Did Not Meet
            </span>
          )}
          {markResult?.error && (
            <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Error: {markResult.error}</span>
          )}
          <Btn
            onClick={markAllMissing}
            disabled={marking || totalMissing === 0}
            tone={totalMissing > 0 ? 'primary' : 'ghost'}
          >
            {marking ? 'Marking…' : `Mark ${totalMissing} Missing as Did Not Meet`}
          </Btn>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Weeks in Month" value={monthWeeks.length} sub="ISO weeks tracked" />
        <StatCard
          label="Fully Reported"
          value={fullyReported}
          sub={`of ${activeSchedule.length} centers`}
          subColor={fullyReported === activeSchedule.length ? C.green : C.mute}
        />
        <StatCard
          label="Missing Reports"
          value={totalMissing}
          sub={`across ${centersWithMissing.length} center${centersWithMissing.length !== 1 ? 's' : ''}`}
          subColor={totalMissing > 0 ? C.red : C.green}
        />
      </div>

      {/* Center × week matrix */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Center</TH>
                {monthWeeks.map(w => (
                  <th key={w} style={{
                    padding: '9px 6px', textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    letterSpacing: '0.03em', textTransform: 'uppercase',
                    color: C.mute, fontWeight: 600,
                    borderBottom: `1px solid ${C.line}`,
                    background: C.cream, minWidth: 64,
                  }}>
                    {formatWeek(w)}
                  </th>
                ))}
                <TH right>Summary</TH>
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ center, weekData, missing, reported }) => {
                const rowColor = missing > 0 ? C.red : reported === monthWeeks.length ? C.green : C.mute
                return (
                  <tr key={center.id} className="growth-row" style={{ background: C.paper }}>
                    <TD bold extra={{ borderLeft: `3px solid ${rowColor}`, paddingLeft: 11 }}>
                      {center.church_name}
                    </TD>
                    {weekData.map(({ week, status, attendance }) => (
                      <td key={week} style={{
                        padding: '9px 6px', textAlign: 'center',
                        borderBottom: `1px solid ${C.line}`,
                        background: status === 'missing' ? '#FEF2F2'
                          : (status === 'reported' && attendance === 0) ? C.amberBg
                          : undefined,
                      }}>
                        <CellIcon status={status} attendance={attendance} />
                      </td>
                    ))}
                    <td style={{
                      padding: '9px 14px', textAlign: 'right',
                      borderBottom: `1px solid ${C.line}`, fontSize: 12, fontWeight: 600,
                      color: missing > 0 ? C.red : C.green,
                      whiteSpace: 'nowrap',
                    }}>
                      {missing > 0 ? `${missing} missing` : 'Complete'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: 20, padding: '10px 16px',
          borderTop: `1px solid ${C.line}`, background: C.cream,
          fontSize: 11, color: C.mute, fontFamily: 'Inter', flexWrap: 'wrap',
        }}>
          {[
            { char: '✓', color: C.green, label: 'Reported' },
            { char: '⚠', color: C.amber, label: 'Verify (0 check-ins)' },
            { char: '○', color: C.mute,  label: 'Did Not Meet' },
            { char: '~', color: C.amber, label: 'Merged' },
            { char: '✗', color: C.red,   label: 'Missing' },
            { char: '…', color: C.blue,  label: 'In Progress' },
          ].map(({ char, color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color, fontWeight: 700 }}>{char}</span> {label}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Page shell ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'month-end', label: 'Month End' },
  { key: 'settings',  label: 'Settings' },
]

export default function GrowthTrackingPage({ embedded = false }) {
  const [tab, setTab] = useState('dashboard')
  const [growthData, setGrowthData] = useState([])
  const [schedule, setSchedule] = useState([])
  const [recipients, setRecipients] = useState([])
  const [weekStatuses, setWeekStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState(null)
  const [syncResult, setSyncResult] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)

  const load = useCallback(async () => {
    const [{ data: growth }, { data: sched }, { data: recip }, { data: flags }, { data: syncedAt }] = await Promise.all([
      supabase.from('v_service_center_weekly_growth').select('*').order('church_name').order('week_start_date'),
      supabase.from('service_center_schedule').select('*').order('church_name'),
      supabase.from('report_recipients').select('*').order('added_at'),
      supabase.from('service_center_week_status').select('*').order('week_start_date', { ascending: false }),
      supabase.from('service_reports').select('synced_at').order('synced_at', { ascending: false }).limit(1),
    ])
    setGrowthData(growth ?? [])
    setSchedule(sched ?? [])
    setRecipients(recip ?? [])
    setWeekStatuses(flags ?? [])
    if (syncedAt?.[0]?.synced_at) setLastSynced(new Date(syncedAt[0].synced_at))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = useCallback(async (from, to) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/growth-reports-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(from && to ? { from, to } : {}),
      })
      const result = await res.json()
      setSyncResult(result)
      setLastSynced(new Date())
      await load()
    } catch (e) {
      setSyncResult({ error: String(e) })
    } finally {
      setSyncing(false)
      // clear the result badge after 6 seconds
      setTimeout(() => setSyncResult(null), 6000)
    }
  }, [load])

  const handleSendReport = useCallback(async (week) => {
    setSending(true)
    setSendResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-growth-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(week ? { week } : {}),
      })
      const result = await res.json()
      setSendResult(result)
    } catch (e) {
      setSendResult({ error: String(e) })
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 8000)
    }
  }, [])

  const fmtSynced = (d) => {
    if (!d) return null
    return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ background: C.cream, minHeight: embedded ? undefined : '100vh', fontFamily: 'Inter' }}>

      {/* Page header */}
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {!embedded && <TrendingUp size={20} color={C.purple} />}
          {!embedded && (
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, margin: 0, color: C.ink, flex: 1 }}>
              Growth Tracking
            </h1>
          )}
          {embedded && <div style={{ flex: 1 }} />}

          {/* Action buttons + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Feedback messages */}
            {sendResult && !sendResult.error && (
              <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
                ✓ Report sent to {sendResult.recipients?.length ?? 0} recipient{sendResult.recipients?.length !== 1 ? 's' : ''}
              </span>
            )}
            {sendResult?.error && (
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Send failed</span>
            )}
            {syncResult && !syncResult.error && !sendResult && (
              <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
                ✓ {syncResult.upserted ?? 0} records updated
                {syncResult.reactivated?.length ? ` · ${syncResult.reactivated.length} reactivated` : ''}
              </span>
            )}
            {syncResult?.error && !sendResult && (
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Sync failed</span>
            )}
            {lastSynced && !syncResult && !sendResult && (
              <span style={{ fontSize: 12, color: C.mute }}>
                Synced {fmtSynced(lastSynced)}
              </span>
            )}

            {/* Send Report */}
            <button
              onClick={() => handleSendReport(selectedWeek || undefined)}
              disabled={sending || syncing}
              title={selectedWeek ? `Send report for week of ${formatWeekFull(selectedWeek)}` : "Send this week's growth report email now"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${C.purple}`,
                background: sending ? C.purpleBg : C.purpleBg,
                color: sending ? C.mute : C.purple,
                fontSize: 13, fontWeight: 600, fontFamily: 'Inter',
                cursor: (sending || syncing) ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              {sending ? 'Sending…' : 'Send Report'}
            </button>

            {/* Sync */}
            <button
              onClick={() => handleSync()}
              disabled={syncing || sending}
              title="Pull latest data from leaders.lwcanada.org"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${C.line}`, background: syncing ? C.cream : C.paper,
                color: syncing ? C.mute : C.ink,
                fontSize: 13, fontWeight: 600, fontFamily: 'Inter',
                cursor: (syncing || sending) ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', background: 'none', border: 'none',
                borderBottom: active ? `2px solid ${C.purple}` : '2px solid transparent',
                color: active ? C.purple : C.mute,
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                fontFamily: 'Inter', whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .growth-row:hover td { background: ${C.cream} !important; }
      `}</style>

      {/* Tab content */}
      <div style={{ padding: '28px 32px 64px', maxWidth: 1100, margin: '0 auto' }}>
        {tab === 'dashboard' && <Dashboard growthData={growthData} loading={loading} selectedWeek={selectedWeek} onWeekChange={setSelectedWeek} />}
        {tab === 'month-end' && <MonthEnd growthData={growthData} schedule={schedule} onRefresh={load} />}
        {tab === 'settings' && (
          <Settings
            schedule={schedule}
            recipients={recipients}
            weekStatuses={weekStatuses}
            onRefresh={load}
            onSync={handleSync}
            syncing={syncing}
          />
        )}
      </div>
    </div>
  )
}
