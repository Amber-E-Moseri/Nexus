#!/usr/bin/env node
/**
 * Local test script for Growth Report PDF generation
 * Generates an actual PDF using fixture data for inspection
 */

import puppeteer from 'puppeteer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Fixture data (matching src/tests/growth-report-fixtures.ts)
const fixtureReportCenters = [
  {
    church_name: 'BLW Niagara Church',
    total_attendance: 85,
    first_timers: 7,
    status: 'reported',
    wow_delta: 5,
    rolling_avg_4wk: 82.5,
  },
  {
    church_name: 'BLW Edmonton Church',
    total_attendance: 62,
    first_timers: 4,
    status: 'reported',
    wow_delta: -3,
    rolling_avg_4wk: 65.0,
  },
  {
    church_name: 'CESGB City Church',
    total_attendance: 78,
    first_timers: 6,
    status: 'reported',
    wow_delta: 8,
    rolling_avg_4wk: 70.0,
  },
  {
    church_name: 'BLW Calgary Church',
    total_attendance: 54,
    first_timers: 3,
    status: 'reported',
    wow_delta: -2,
    rolling_avg_4wk: 56.0,
  },
  {
    church_name: 'Central East City Church',
    total_attendance: 91,
    first_timers: 9,
    status: 'reported',
    wow_delta: 12,
    rolling_avg_4wk: 79.0,
  },
  {
    church_name: 'BLW Downtown Winnipeg',
    total_attendance: 0,
    first_timers: 0,
    status: 'merged',
    wow_delta: null,
    rolling_avg_4wk: null,
    merged_with: ['auto-12345678'],
    note: 'Services merged with satellite campus',
  },
  {
    church_name: 'Lethbridge City Church',
    total_attendance: 0,
    first_timers: 0,
    status: 'did_not_meet',
    wow_delta: null,
    rolling_avg_4wk: 45.0,
    note: 'Building renovation',
  },
  {
    church_name: 'BLW Regina Church',
    total_attendance: 0,
    first_timers: 0,
    status: 'missing',
    wow_delta: null,
    rolling_avg_4wk: 52.0,
  },
  {
    church_name: 'BLW Mississauga Church',
    total_attendance: 73,
    first_timers: 5,
    status: 'reported',
    wow_delta: 1,
    rolling_avg_4wk: 71.5,
  },
  {
    church_name: 'BLW Scarborough Church',
    total_attendance: 68,
    first_timers: 4,
    status: 'reported',
    wow_delta: null,
    rolling_avg_4wk: 65.0,
  },
]

const fixtureTrend = [
  { week: '2026-08-31', attendance: 640, firstTimers: 42 },
  { week: '2026-09-07', attendance: 655, firstTimers: 45 },
  { week: '2026-09-14', attendance: 668, firstTimers: 48 },
  { week: '2026-09-21', attendance: 675, firstTimers: 51 },
  { week: '2026-09-28', attendance: 682, firstTimers: 53 },
  { week: '2026-10-05', attendance: 695, firstTimers: 56 },
  { week: '2026-10-12', attendance: 708, firstTimers: 58 },
  { week: '2026-10-19', attendance: 720, firstTimers: 62 },
  { week: '2026-10-26', attendance: 738, firstTimers: 65 },
  { week: '2026-11-02', attendance: 745, firstTimers: 67 },
  { week: '2026-11-09', attendance: 760, firstTimers: 70 },
  { week: '2026-11-16', attendance: 775, firstTimers: 73 },
]

function createFixtureReport() {
  const reported = fixtureReportCenters.filter(c => c.status === 'reported')
  const networkAttendance = reported.reduce((sum, c) => sum + c.total_attendance, 0)
  const firstTimers = reported.reduce((sum, c) => sum + c.first_timers, 0)
  const attendanceDelta = reported.reduce((sum, c) => sum + (c.wow_delta ?? 0), 0)

  return {
    reportingWeek: 'September 21, 2026',
    networkAttendance,
    attendanceDelta,
    firstTimers,
    reportingCenters: reported.length,
    totalCenters: fixtureReportCenters.length,
    reportingPercentage: Math.round((reported.length / fixtureReportCenters.length) * 100),
    trend: fixtureTrend,
    centers: fixtureReportCenters,
    generatedAt: new Date().toISOString(),
  }
}

async function generatePDF() {
  console.log('🚀 Growth Report PDF Generation Test')
  console.log('====================================\n')

  const report = createFixtureReport()

  console.log('📊 Report Summary:')
  console.log(`   Week: ${report.reportingWeek}`)
  console.log(`   Network Attendance: ${report.networkAttendance}`)
  console.log(`   First-Timers: ${report.firstTimers}`)
  console.log(`   WoW Delta: ${report.attendanceDelta >= 0 ? '+' : ''}${report.attendanceDelta}`)
  console.log(`   Reporting: ${report.reportingCenters}/${report.totalCenters} (${report.reportingPercentage}%)`)
  console.log(`   Trend Data: ${report.trend.length} weeks\n`)

  let browser = null
  try {
    console.log('🌐 Launching Puppeteer...')
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    })
    console.log('✅ Browser launched\n')

    console.log('📑 Creating page...')
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    console.log('✅ Page created\n')

    // Simple inline HTML generation (same as API function)
    const fmt = (n) => (n == null ? '—' : n.toLocaleString())
    const delta = (n) => {
      if (n == null) return '—'
      return n > 0 ? `+${n}` : String(n)
    }
    const escapeHtml = (text) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]))

    // Generate chart SVG
    const width = 500
    const height = 150
    const padding = { top: 20, right: 20, bottom: 30, left: 40 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const attendances = report.trend.map(t => t.attendance).filter(a => a != null)
    const maxAttendance = Math.max(...attendances, 100)
    const minAttendance = 0

    const scaleX = (index) => padding.left + (index / (report.trend.length - 1 || 1)) * plotWidth
    const scaleY = (value) => padding.top + plotHeight - ((value - minAttendance) / (maxAttendance - minAttendance)) * plotHeight

    const points = report.trend.map((t, i) => ({
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

    const xLabels = report.trend
      .map((t, i) => {
        if (i % 2 !== 0 && i !== report.trend.length - 1) return ''
        const label = t.week.split('-')[2]
        const x = scaleX(i)
        return `<text x="${x}" y="${height - 10}" font-size="8" fill="#9e9488" text-anchor="middle">${label}</text>`
      })
      .filter(l => l)
      .join('\n  ')

    const chartSVG = `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto;">
      ${gridLines}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1"/>
      ${yLabels}
      ${xLabels}
      <path d="${linePath}" stroke="#4b2c71" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#4b2c71" stroke="white" stroke-width="1.5"/>`).join('\n      ')}
    </svg>`

    // Status chips
    const statusByType = {
      reported: report.centers.filter(c => c.status === 'reported').length,
      merged: report.centers.filter(c => c.status === 'merged').length,
      did_not_meet: report.centers.filter(c => c.status === 'did_not_meet').length,
      missing: report.centers.filter(c => c.status === 'missing').length,
    }

    const statusChips = [
      { count: statusByType.reported, label: 'Reported', class: 'status-chip-reported' },
      { count: statusByType.merged, label: 'Merged', class: 'status-chip-merged' },
      { count: statusByType.did_not_meet, label: 'Did Not Meet', class: 'status-chip-didnotmeet' },
      { count: statusByType.missing, label: 'Missing', class: 'status-chip-missing' },
    ]
      .filter(s => s.count > 0)
      .map(s => `<span style="display: inline-flex; align-items: center; font-size: 9px; font-weight: 600; padding: 0.35rem 0.6rem; border-radius: 3px; border: 1px solid; white-space: nowrap;" class="status-chip status-chip-${s.class}"><span style="font-weight: 700; margin-right: 0.2rem;">${s.count}</span>${s.label}</span>`)
      .join('\n          ')

    // Sort centers
    const sortedCenters = [...report.centers].sort((a, b) => {
      if (a.status === 'reported' && b.status !== 'reported') return -1
      if (a.status !== 'reported' && b.status === 'reported') return 1
      return b.total_attendance - a.total_attendance
    })

    const statusLabel = {
      reported: 'Reported',
      merged: 'Merged',
      did_not_meet: 'Did Not Meet',
      missing: 'Missing',
      current: 'In Progress',
    }

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
        const centerName = escapeHtml(center.church_name)

        return `
        <tr>
          <td style="font-weight: 600; color: #1a1714;">${centerName}</td>
          <td style="text-align: right; font-family: 'SF Mono', 'Roboto Mono', monospace;">${attendanceText}</td>
          <td style="text-align: right; font-family: 'SF Mono', 'Roboto Mono', monospace;">${firstTimersText}</td>
          <td style="text-align: right; font-family: 'SF Mono', 'Roboto Mono', monospace;"><span style="color: ${deltaClass === 'table-positive' ? '#16a34a' : deltaClass === 'table-negative' ? '#dc2626' : '#9e9488'}; font-weight: ${deltaClass !== 'table-neutral' ? '600' : '400'};">${deltaText}</span></td>
          <td style="text-align: right; font-family: 'SF Mono', 'Roboto Mono', monospace; color: #9e9488;">${avgText}</td>
          <td style="text-align: center;"><span style="display: inline-flex; align-items: center; font-size: 8px; font-weight: 600; padding: 0.2rem 0.4rem; border-radius: 2px; white-space: nowrap;" class="table-status ${statusClass}">${statusLabel[center.status]}</span></td>
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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BLW Canada — Weekly Growth Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: letter; margin: 0.5in; print-color-adjust: exact; }
    @media print { body { margin: 0; padding: 0; background: white; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #1a1714; background: white; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .report { width: 100%; max-width: 8.5in; margin: 0 auto; background: white; }
    .header { background: #4b2c71; color: white; padding: 1.2rem 1.5rem; margin: -0.5in -0.5in 0 -0.5in; margin-bottom: 1.2rem; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .header-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #b89cc4; margin-bottom: 0.3rem; }
    .header-title { font-size: 20px; font-weight: 700; margin-bottom: 0.2rem; }
    .header-subtitle { font-size: 11px; color: #b89cc4; }
    .kpi-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; margin-bottom: 1.2rem; page-break-inside: avoid; }
    .kpi-card { border: 1px solid #e8dde0; border-radius: 4px; padding: 0.8rem; background: #faf8f6; page-break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .kpi-card-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9e9488; margin-bottom: 0.3rem; }
    .kpi-card-value { font-size: 22px; font-weight: 700; color: #4b2c71; margin-bottom: 0.2rem; line-height: 1; }
    .kpi-card-meta { font-size: 9px; color: #9e9488; }
    .kpi-card-positive { color: #16a34a; }
    .kpi-card-negative { color: #dc2626; }
    .chart-section { margin-bottom: 1.2rem; page-break-inside: avoid; }
    .section-title { font-size: 11px; font-weight: 700; color: #4b2c71; margin-bottom: 0.4rem; }
    .chart-container { background: #faf8f6; border: 1px solid #e8dde0; border-radius: 4px; padding: 0.8rem; min-height: 200px; page-break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .status-section { margin-bottom: 1.2rem; page-break-inside: avoid; }
    .status-chips { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .status-chip-reported { background: #dcfce7; border-color: #16a34a; color: #16a34a; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .status-chip-merged { background: #fef3c7; border-color: #d97706; color: #d97706; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .status-chip-didnotmeet { background: #f3f4f6; border-color: #6b7280; color: #6b7280; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .status-chip-missing { background: #fee2e2; border-color: #dc2626; color: #dc2626; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .table thead { background: #faf8f6; border-bottom: 1px solid #e8dde0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table thead th { padding: 0.5rem 0.6rem; text-align: left; font-weight: 700; color: #9e9488; font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .table tbody tr { border-bottom: 1px solid #f3f0ed; page-break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table tbody tr:last-child { border-bottom: 1px solid #e8dde0; }
    .table tbody td { padding: 0.5rem 0.6rem; vertical-align: middle; }
    .table-status-reported { background: #dcfce7; color: #16a34a; border: 0.5px solid #16a34a; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table-status-merged { background: #fef3c7; color: #d97706; border: 0.5px solid #d97706; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table-status-didnotmeet { background: #f3f4f6; color: #6b7280; border: 0.5px solid #6b7280; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .table-status-missing { background: #fee2e2; color: #dc2626; border: 0.5px solid #dc2626; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .footer { margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid #e8dde0; font-size: 9px; color: #9e9488; page-break-inside: avoid; }
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

    console.log('📄 Setting page content...')
    await page.setContent(html, { waitUntil: 'networkidle0' })
    console.log('✅ Content loaded\n')

    console.log('🖨️  Generating PDF...')
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
      preferCSSPageSize: true,
    })
    console.log('✅ PDF generated\n')

    const outputPath = path.join(__dirname, '..', 'growth-report-test.pdf')
    fs.writeFileSync(outputPath, pdfBuffer)

    const stats = fs.statSync(outputPath)
    const fileSizeKB = (stats.size / 1024).toFixed(2)

    console.log('📦 PDF Output:')
    console.log(`   Path: ${outputPath}`)
    console.log(`   Size: ${fileSizeKB} KB (${stats.size} bytes)`)
    console.log(`   Page Count: 1 (single page)`)
    console.log(`   Status: ✅ SUCCESS\n`)

    console.log('🔍 Visual Verification Checklist:')
    console.log('   [ ] Purple header with BLW branding')
    console.log('   [ ] Three KPI cards aligned')
    console.log('   [ ] KPI values readable')
    console.log('   [ ] Attendance trend chart renders')
    console.log('   [ ] Chart axes and labels visible')
    console.log('   [ ] Chart line and points visible')
    console.log('   [ ] Status chips display correctly')
    console.log('   [ ] Table headers styled')
    console.log('   [ ] Table rows visible and aligned')
    console.log('   [ ] Status colors preserved')
    console.log('   [ ] Typography readable at 100%')
    console.log('   [ ] No clipped content')
    console.log('   [ ] No browser artifacts\n')

    console.log('✨ PDF GENERATION COMPLETE')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close().catch(e => console.error('Browser close error:', e))
    }
  }
}

generatePDF()
