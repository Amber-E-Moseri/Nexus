// Growth Report HTML Renderer
// Converts GrowthReport data into HTML using the template

import { GrowthReport, fmt, delta, statusLabel } from './reportModels'
import template from './growthReportTemplate.html?raw'

export function renderGrowthReportHTML(report: GrowthReport): string {
  const statusByType = {
    reported: report.centers.filter(c => c.status === 'reported'),
    merged: report.centers.filter(c => c.status === 'merged'),
    did_not_meet: report.centers.filter(c => c.status === 'did_not_meet'),
    missing: report.centers.filter(c => c.status === 'missing'),
    current: report.centers.filter(c => c.status === 'current'),
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

  // Sort centers by attendance (reported first, then others)
  const sortedCenters = [...report.centers].sort((a, b) => {
    if (a.status === 'reported' && b.status !== 'reported') return -1
    if (a.status !== 'reported' && b.status === 'reported') return 1
    return b.total_attendance - a.total_attendance
  })

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
  const generatedAt = new Date(report.generatedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  // Replace template placeholders
  let html = template
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
    .replace('{{GENERATED_AT}}', escapeHtml(generatedAt))

  return html
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
