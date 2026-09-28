// Backend-compatible Growth Report HTML Renderer (Node.js / Vercel)
// Used by api/growth-report-pdf.ts (no Vite dependencies)

export interface GrowthReportData {
  reportingWeek: string
  networkAttendance: number
  attendanceDelta: number | null
  firstTimers: number
  reportingCenters: number
  totalCenters: number
  reportingPercentage: number
  trend: Array<{ week: string; attendance: number; firstTimers: number }>
  centers: Array<{
    church_name: string
    total_attendance: number
    first_timers: number
    status: 'reported' | 'merged' | 'did_not_meet' | 'missing' | 'current'
    wow_delta: number | null
    rolling_avg_4wk: number | null
  }>
  generatedAt?: string
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function delta(n: number | null): string {
  if (n == null) return '—'
  if (n > 0) return `+${n}`
  return String(n)
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}

function generateAttendanceChart(trend: Array<{ week: string; attendance: number }>): string {
  if (!trend || trend.length === 0) {
    return '<div style="padding: 1rem; text-align: center; color: #9e9488;">No trend data available</div>'
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
  const scaleY = (value: number) => padding.top + plotHeight - ((value - minAttendance) / (maxAttendance - minAttendance)) * plotHeight

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

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto;">
      ${gridLines}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
      ${yLabels}
      ${xLabels}
      <path d="${linePath}" stroke="#4b2c71" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#4b2c71" stroke="white" stroke-width="1.5"/>`).join('\n      ')}
    </svg>`
}

export function renderGrowthReportHTML(report: GrowthReportData): string {
  const statusByType = {
    reported: report.centers.filter(c => c.status === 'reported'),
    merged: report.centers.filter(c => c.status === 'merged'),
    did_not_meet: report.centers.filter(c => c.status === 'did_not_meet'),
    missing: report.centers.filter(c => c.status === 'missing'),
  }

  // Status chips
  const statusChips = [
    { status: 'reported', count: statusByType.reported.length, label: 'Reported', class: 'status-chip-reported' },
    { status: 'merged', count: statusByType.merged.length, label: 'Merged', class: 'status-chip-merged' },
    { status: 'did_not_meet', count: statusByType.did_not_meet.length, label: 'Did Not Meet', class: 'status-chip-didnotmeet' },
    { status: 'missing', count: statusByType.missing.length, label: 'Missing', class: 'status-chip-missing' },
  ]
    .filter(s => s.count > 0)
    .map(s => `<span class="status-chip ${s.class}"><span class="status-chip-count">${s.count}</span>${s.label}</span>`)
    .join('\n          ')

  // Sort centers
  const sortedCenters = [...report.centers].sort((a, b) => {
    if (a.status === 'reported' && b.status !== 'reported') return -1
    if (a.status !== 'reported' && b.status === 'reported') return 1
    return b.total_attendance - a.total_attendance
  })

  const statusLabel: Record<string, string> = {
    reported: 'Reported',
    merged: 'Merged',
    did_not_meet: 'Did Not Meet',
    missing: 'Missing',
    current: 'In Progress',
  }

  // Table rows
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

      const avgText = fmt(center.rolling_avg_4wk)

      return `
        <tr>
          <td class="table-center-name">${escapeHtml(center.church_name)}</td>
          <td class="table-number">${attendanceText}</td>
          <td class="table-number">${firstTimersText}</td>
          <td class="table-number"><span class="${deltaClass}">${deltaText}</span></td>
          <td class="table-number"><span class="table-neutral">${avgText}</span></td>
          <td class="text-center"><span class="table-status ${statusClass}">${statusLabel[center.status]}</span></td>
        </tr>`
    })
    .join('\n          ')

  // Delta display
  const deltaText = report.attendanceDelta != null ? delta(report.attendanceDelta) : '—'
  const deltaClass = (report.attendanceDelta ?? 0) >= 0 ? 'kpi-card-positive' : 'kpi-card-negative'

  // Format timestamp
  const generatedAt = new Date(report.generatedAt || Date.now()).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  // Chart
  const chartSVG = generateAttendanceChart(report.trend)

  // Build HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLW Canada — Weekly Growth Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: letter; margin: 0.5in; print-color-adjust: exact; }
    @media print { body { margin: 0; padding: 0; background: white; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #1a1714; background: white; print-color-adjust: exact; }
    .report { width: 100%; max-width: 8.5in; margin: 0 auto; background: white; }
    .header { background: #4b2c71; color: white; padding: 1.2rem 1.5rem; margin: -0.5in -0.5in 0 -0.5in; margin-bottom: 1.2rem; print-color-adjust: exact; }
    .header-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #b89cc4; margin-bottom: 0.3rem; }
    .header-title { font-size: 20px; font-weight: 700; margin-bottom: 0.2rem; }
    .header-subtitle { font-size: 11px; color: #b89cc4; }
    .kpi-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; margin-bottom: 1.2rem; page-break-inside: avoid; }
    .kpi-card { border: 1px solid #e8dde0; border-radius: 4px; padding: 0.8rem; background: #faf8f6; page-break-inside: avoid; print-color-adjust: exact; }
    .kpi-card-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9e9488; margin-bottom: 0.3rem; }
    .kpi-card-value { font-size: 22px; font-weight: 700; color: #4b2c71; margin-bottom: 0.2rem; line-height: 1; }
    .kpi-card-meta { font-size: 9px; color: #9e9488; }
    .kpi-card-positive { color: #16a34a; }
    .kpi-card-negative { color: #dc2626; }
    .chart-section { margin-bottom: 1.2rem; page-break-inside: avoid; }
    .section-title { font-size: 11px; font-weight: 700; color: #4b2c71; margin-bottom: 0.4rem; }
    .chart-container { background: #faf8f6; border: 1px solid #e8dde0; border-radius: 4px; padding: 0.8rem; min-height: 200px; page-break-inside: avoid; print-color-adjust: exact; }
    .status-section { margin-bottom: 1.2rem; page-break-inside: avoid; }
    .status-chips { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .status-chip { display: inline-flex; align-items: center; font-size: 9px; font-weight: 600; padding: 0.35rem 0.6rem; border-radius: 3px; border: 1px solid; white-space: nowrap; print-color-adjust: exact; }
    .status-chip-reported { background: #dcfce7; border-color: #16a34a; color: #16a34a; }
    .status-chip-merged { background: #fef3c7; border-color: #d97706; color: #d97706; }
    .status-chip-didnotmeet { background: #f3f4f6; border-color: #6b7280; color: #6b7280; }
    .status-chip-missing { background: #fee2e2; border-color: #dc2626; color: #dc2626; }
    .status-chip-count { font-weight: 700; margin-right: 0.2rem; }
    .table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .table thead { background: #faf8f6; border-bottom: 1px solid #e8dde0; print-color-adjust: exact; }
    .table thead th { padding: 0.5rem 0.6rem; text-align: left; font-weight: 700; color: #9e9488; font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .table tbody tr { border-bottom: 1px solid #f3f0ed; page-break-inside: avoid; print-color-adjust: exact; }
    .table tbody tr:last-child { border-bottom: 1px solid #e8dde0; }
    .table tbody td { padding: 0.5rem 0.6rem; vertical-align: middle; }
    .table-center-name { font-weight: 600; color: #1a1714; }
    .table-status { display: inline-flex; align-items: center; font-size: 8px; font-weight: 600; padding: 0.2rem 0.4rem; border-radius: 2px; white-space: nowrap; print-color-adjust: exact; }
    .table-status-reported { background: #dcfce7; color: #16a34a; border: 0.5px solid #16a34a; }
    .table-status-merged { background: #fef3c7; color: #d97706; border: 0.5px solid #d97706; }
    .table-status-didnotmeet { background: #f3f4f6; color: #6b7280; border: 0.5px solid #6b7280; }
    .table-status-missing { background: #fee2e2; color: #dc2626; border: 0.5px solid #dc2626; }
    .table-number { text-align: right; font-family: 'SF Mono', 'Roboto Mono', monospace; }
    .table-positive { color: #16a34a; font-weight: 600; }
    .table-negative { color: #dc2626; font-weight: 600; }
    .table-neutral { color: #9e9488; }
    .footer { margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid #e8dde0; font-size: 9px; color: #9e9488; page-break-inside: avoid; }
    .text-center { text-align: center; }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <div class="header-label">BLW CANADA</div>
      <div class="header-title">Weekly Growth Report</div>
      <div class="header-subtitle">${escapeHtml(report.reportingWeek)}</div>
    </div>

    <div class="kpi-section">
      <div class="kpi-card">
        <div class="kpi-card-label">Network Attendance</div>
        <div class="kpi-card-value">${fmt(report.networkAttendance)}</div>
        <div class="kpi-card-meta"><span class="${deltaClass}">${deltaText}</span> vs last week</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">First-Timers</div>
        <div class="kpi-card-value">${fmt(report.firstTimers)}</div>
        <div class="kpi-card-meta">network total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-label">Centers Reporting</div>
        <div class="kpi-card-value">${report.reportingCenters}</div>
        <div class="kpi-card-meta">${report.reportingPercentage}% of ${report.totalCenters}</div>
      </div>
    </div>

    <div class="chart-section">
      <div class="section-title">Attendance Trend (12 Weeks)</div>
      <div class="chart-container">
        ${chartSVG}
      </div>
    </div>

    <div class="status-section">
      <div class="section-title">Center Reporting Status</div>
      <div class="status-chips">
        ${statusChips}
      </div>
    </div>

    <div style="margin-bottom: 1rem;">
      <div class="section-title">Center Breakdown</div>
      <table class="table">
        <thead>
          <tr>
            <th>Center</th>
            <th style="text-align: right;">Attendance</th>
            <th style="text-align: right;">1st-Timers</th>
            <th style="text-align: right;">WoW</th>
            <th style="text-align: right;">4-Wk Avg</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div style="margin: 0.2rem 0;">WoW = week-over-week attendance change · 4-Wk Avg = rolling 4-week average</div>
      <div style="margin: 0.2rem 0;">Generated ${escapeHtml(generatedAt)}</div>
    </div>
  </div>
</body>
</html>`
}
