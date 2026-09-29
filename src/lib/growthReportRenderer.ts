// Growth Report HTML Renderer
// Canonical presentation logic shared by Vite (browser) and Node (API) contexts.
// Use renderGrowthReportHTMLWithTemplate(report, templateStr) — environment-neutral.

import { GrowthReport, TrendPoint, fmt, delta, statusLabel } from './reportModels.js'

// ─── Chart ────────────────────────────────────────────────────────────────────

export function generateAttendanceChart(trend: TrendPoint[] = []): string {
  if (!trend || trend.length === 0) {
    return '<div class="chart-placeholder">[No trend data available]</div>'
  }

  const width = 500
  const height = 150
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const attendances = trend.map(t => t.attendance).filter(a => a != null)
  const maxAttendance = Math.max(...attendances, 100)
  const minAttendance = 0

  const scaleX = (index: number) => padding.left + (index / (trend.length - 1 || 1)) * plotWidth
  const scaleY = (value: number) =>
    padding.top + plotHeight - ((value - minAttendance) / (maxAttendance - minAttendance)) * plotHeight

  const points = trend.map((t, i) => ({
    x: scaleX(i),
    y: scaleY(t.attendance),
    attendance: t.attendance,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const y = padding.top + (i / 4) * plotHeight
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e8dde0" stroke-width="0.5"/>`
  }).join('\n  ')

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const value = Math.round(minAttendance + ((4 - i) / 4) * (maxAttendance - minAttendance))
    const y = padding.top + (i / 4) * plotHeight
    return `<text x="${padding.left - 5}" y="${y + 3}" font-size="8" fill="#9e9488" text-anchor="end">${value}</text>`
  }).join('\n  ')

  const xLabels = trend
    .map((t, i) => {
      if (i % 2 !== 0 && i !== trend.length - 1) return ''
      const label = t.week.split('-')[2]
      const x = scaleX(i)
      return `<text x="${x}" y="${height - 10}" font-size="8" fill="#9e9488" text-anchor="middle">${label}</text>`
    })
    .filter(l => l)
    .join('\n  ')

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
  ${gridLines}
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
  ${yLabels}
  ${xLabels}
  <path d="${linePath}" stroke="#4b2c71" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#4b2c71" stroke="white" stroke-width="1.5"/>`).join('\n  ')}
</svg>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, char => map[char])
}

// ─── Canonical renderer (environment-neutral) ─────────────────────────────────

export function renderGrowthReportHTMLWithTemplate(report: GrowthReport, templateStr: string): string {
  const statusCounts = {
    reported: report.centers.filter(c => c.status === 'reported').length,
    merged: report.centers.filter(c => c.status === 'merged').length,
    did_not_meet: report.centers.filter(c => c.status === 'did_not_meet').length,
    missing: report.centers.filter(c => c.status === 'missing').length,
  }

  const statusChips = [
    { count: statusCounts.reported, label: 'Reported', cls: 'status-chip-reported' },
    { count: statusCounts.merged, label: 'Merged', cls: 'status-chip-merged' },
    { count: statusCounts.did_not_meet, label: 'Did Not Meet', cls: 'status-chip-didnotmeet' },
    { count: statusCounts.missing, label: 'Missing', cls: 'status-chip-missing' },
  ]
    .filter(s => s.count > 0)
    .map(s => `<span class="status-chip ${s.cls}"><span class="status-chip-count">${s.count}</span>${s.label}</span>`)
    .join('\n          ')

  const sortedCenters = [...report.centers].sort((a, b) => {
    if (a.status === 'reported' && b.status !== 'reported') return -1
    if (a.status !== 'reported' && b.status === 'reported') return 1
    return b.total_attendance - a.total_attendance
  })

  const tableRows = sortedCenters
    .map(center => {
      const statusClass = `table-status-${center.status.replace(/_/g, '')}`
      const attendanceText = center.status === 'reported' ? fmt(center.total_attendance) : '—'
      const firstTimersText = center.status === 'reported' ? fmt(center.first_timers) : '—'

      let deltaText = '—'
      let deltaClass = 'table-neutral'
      if (center.status === 'reported' && center.wow_delta != null) {
        deltaText = delta(center.wow_delta)
        deltaClass = center.wow_delta >= 0 ? 'table-positive' : 'table-negative'
      }

      return `
        <tr>
          <td class="table-center-name">${escapeHtml(center.church_name)}</td>
          <td class="table-number">${attendanceText}</td>
          <td class="table-number">${firstTimersText}</td>
          <td class="table-number"><span class="${deltaClass}">${deltaText}</span></td>
          <td class="table-number"><span class="table-neutral">${fmt(center.rolling_avg_4wk)}</span></td>
          <td class="text-center"><span class="table-status ${statusClass}">${statusLabel[center.status]}</span></td>
        </tr>`
    })
    .join('\n          ')

  const deltaText = report.attendanceDelta != null ? delta(report.attendanceDelta) : '—'
  const deltaClass = (report.attendanceDelta ?? 0) >= 0 ? 'kpi-card-positive' : 'kpi-card-negative'

  const generatedAt = new Date(report.generatedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const chartSVG = generateAttendanceChart(report.trend)

  return templateStr
    .replace('{{WEEK_LABEL}}', escapeHtml(report.reportingWeek))
    .replace('{{NETWORK_ATTENDANCE}}', fmt(report.networkAttendance))
    .replace('{{DELTA_TEXT}}', deltaText)
    .replace('{{DELTA_CLASS}}', deltaClass)
    .replace('{{FIRST_TIMERS}}', fmt(report.firstTimers))
    .replace('{{REPORTING_COUNT}}', String(report.reportingCenters))
    .replace('{{TOTAL_CENTERS}}', String(report.totalCenters))
    .replace('{{REPORTING_PCT}}', String(report.reportingPercentage))
    .replace('{{STATUS_CHIPS}}', statusChips)
    .replace('{{TABLE_ROWS}}', tableRows)
    .replace('{{CHART_SVG}}', chartSVG)
    .replace('{{GENERATED_AT}}', escapeHtml(generatedAt))
}

