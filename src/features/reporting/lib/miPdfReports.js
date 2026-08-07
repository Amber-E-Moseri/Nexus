import jsPDF from 'jspdf'

const C = {
  purple:   [76, 42, 146],
  white:    [255, 255, 255],
  text:     [45, 42, 34],
  muted:    [158, 148, 136],
  border:   [237, 232, 220],
  bg:       [250, 250, 248],
  teal:     [93, 202, 165],
  orange:   [239, 159, 39],
  inactive: [229, 218, 204],
}

const M = 15
const PAGE_BOTTOM = 22

function ensureSpace(doc, y, needed) {
  const h = doc.internal.pageSize.getHeight()
  if (y + needed > h - PAGE_BOTTOM) { doc.addPage(); return 20 }
  return y
}

function header(doc, title, subtitle) {
  const pw = doc.internal.pageSize.getWidth()
  doc.setFillColor(...C.purple)
  doc.rect(0, 0, pw, 28, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...C.white)
  doc.text('BLW Canada — ' + title, M, 12)
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, M, 20)
  doc.setTextColor(...C.text)
  return 36
}

function sectionTitle(doc, y, text, pw) {
  y = ensureSpace(doc, y, 14)
  doc.setFillColor(...C.bg)
  doc.rect(M, y, pw - M * 2, 8, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.muted[0], ...C.muted.slice(1))
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
  doc.text(text.toUpperCase(), M + 3, y + 5.5)
  doc.setTextColor(...C.text)
  return y + 12
}

function tableRow(doc, y, cols, widths, isHeader = false) {
  const pw = doc.internal.pageSize.getWidth()
  y = ensureSpace(doc, y, 8)
  if (isHeader) {
    doc.setFillColor(...C.border)
    doc.rect(M, y, pw - M * 2, 7, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.muted)
  } else {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...C.text)
  }
  let x = M + 2
  cols.forEach((col, i) => {
    doc.text(String(col), x, y + 5, { maxWidth: widths[i] - 4 })
    x += widths[i]
  })
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(M, y + 7, pw - M, y + 7)
  doc.setTextColor(...C.text)
  return y + 8
}

function footer(doc) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.muted)
    doc.text(`BLW Canada Nexus  •  Generated ${new Date().toLocaleDateString('en-CA')}`, M, ph - 6)
    doc.text(`Page ${i} of ${pages}`, pw - M, ph - 6, { align: 'right' })
  }
}

export function generateAttendanceSummaryPDF(subgroups, sgStats, filters) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pw = doc.internal.pageSize.getWidth()
  const colW = [80, 24, 24, 20, 20, 20, 24, 30]
  let y = header(doc, 'Attendance Summary', `Period: ${filters.dateFrom} to ${filters.dateTo}  |  Type: ${filters.eventType}`)

  y = sectionTitle(doc, y, 'Frequency breakdown by subgroup', pw)
  y = tableRow(doc, y, ['Subgroup', 'In system', 'Active', '1×', '2×', '3×', '3+×', 'Active %'], colW, true)

  for (const sg of subgroups) {
    const s = sgStats?.get(sg.id)
    if (!s) continue
    const activePct = s.in_system_total > 0 ? `${Math.round((s.active / s.in_system_total) * 100)}%` : '—'
    y = tableRow(doc, y, [sg.name, s.in_system_total, s.active, s.freq_once, s.freq_twice, s.freq_thrice, s.freq_three_plus, activePct], colW)
  }

  footer(doc)
  doc.save('attendance-summary.pdf')
}

export function generateAttendanceTrendsPDF(weeks) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pw = doc.internal.pageSize.getWidth()
  const colW = [60, 40, 40]
  let y = header(doc, 'Attendance Trends', `Week-over-week  |  ${weeks.length} weeks`)

  y = sectionTitle(doc, y, 'Weekly attendance — unique members', pw)
  y = tableRow(doc, y, ['Week of', 'Service', 'Cell'], colW, true)

  for (const week of weeks) {
    y = tableRow(doc, y, [week.week_label, week.service, week.cell], colW)
  }

  if (weeks.length >= 2) {
    const avgSvc = Math.round(weeks.reduce((s, w) => s + w.service, 0) / weeks.length)
    const avgCell = Math.round(weeks.reduce((s, w) => s + w.cell, 0) / weeks.length)
    y += 4
    y = tableRow(doc, y, [`Average (${weeks.length} weeks)`, avgSvc, avgCell], colW)
  }

  footer(doc)
  doc.save('attendance-trends.pdf')
}

export function generateFirstTimersPDF(firstTimers, filters) {
  const doc = new jsPDF()
  const pw = doc.internal.pageSize.getWidth()
  let y = header(doc, 'First-Timer Report', `Last ${filters.monthsBack || 1} month(s)`)

  y = sectionTitle(doc, y, 'New members by source', pw)

  const total = (firstTimers.service || 0) + (firstTimers.cell || 0)
  y = tableRow(doc, y, ['Source', 'Count', '% of total'], [60, 40, 60], true)
  y = tableRow(doc, y, ['Service', firstTimers.service || 0, total > 0 ? `${Math.round(((firstTimers.service || 0) / total) * 100)}%` : '—'], [60, 40, 60])
  y = tableRow(doc, y, ['Cell', firstTimers.cell || 0, total > 0 ? `${Math.round(((firstTimers.cell || 0) / total) * 100)}%` : '—'], [60, 40, 60])
  y += 2
  y = tableRow(doc, y, ['Total', total, '100%'], [60, 40, 60])

  footer(doc)
  doc.save('first-timer-report.pdf')
}

export function generateFoundationSchoolPDF(fsStats) {
  const doc = new jsPDF()
  const pw = doc.internal.pageSize.getWidth()
  let y = header(doc, 'Foundation School Report', `All active members`)

  y = sectionTitle(doc, y, 'Completion by status', pw)
  y = tableRow(doc, y, ['Status', 'Members', '% of active'], [70, 40, 60], true)

  const rows = [
    ['Completed', fsStats.completed, `${fsStats.percentages.completed}%`],
    ['In progress', fsStats.in_progress, `${fsStats.percentages.in_progress}%`],
    ['Not recorded', fsStats.not_recorded, `${fsStats.percentages.not_recorded}%`],
    ['Total', fsStats.total, '100%'],
  ]
  for (const row of rows) {
    y = tableRow(doc, y, row, [70, 40, 60])
  }

  footer(doc)
  doc.save('foundation-school-report.pdf')
}
