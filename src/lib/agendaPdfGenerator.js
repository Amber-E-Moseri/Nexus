import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { THEME_OPTIONS } from '../data/agendaTemplates'

// Letter page at 96 DPI = 816px wide. html2canvas must match this.
const PAGE_PX = 816
const PADDING_PX = 56 // ~0.58in each side

export async function generateAgendaPdf(agendaData, agendaItems, timings, filename = 'agenda.pdf') {
  try {
    const theme = THEME_OPTIONS.find((t) => t.id === agendaData.theme) || THEME_OPTIONS[0]

    const container = document.createElement('div')
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${PAGE_PX}px;
      background: ${theme.background};
      padding: ${PADDING_PX}px;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
      line-height: 1.6;
      box-sizing: border-box;
    `

    container.innerHTML = buildPdfHtml(agendaData, timings, theme)
    document.body.appendChild(container)

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: theme.background,
      logging: false,
      // No width override — use the container's natural PAGE_PX width
    })

    document.body.removeChild(container)

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

    const pdfWidth  = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgHeight = (canvas.height * pdfWidth) / canvas.width

    let heightLeft = imgHeight
    let position   = 0

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, pdfWidth, imgHeight)
    heightLeft -= pdfHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
    }

    // Page numbers
    const pageCount = pdf.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i)
      pdf.setFontSize(9)
      pdf.setTextColor(170, 170, 170)
      pdf.text(`Page ${i} of ${pageCount}`, pdfWidth / 2, pdfHeight - 24, { align: 'center' })
    }

    pdf.save(filename)
    return { success: true }
  } catch (error) {
    console.error('[agendaPdfGenerator]', error)
    throw new Error(`Failed to generate PDF: ${error.message}`)
  }
}

function buildPdfHtml(agendaData, timings, theme) {
  const totalMinutes = timings.reduce((sum, t) => sum + t.duration, 0)
  const contentWidth = PAGE_PX - PADDING_PX * 2 // 704px

  const meetingTypeLabel = (agendaData.meetingType || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  const rows = timings.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : `${theme.accent}18`};">
      <td style="padding:9px 12px;font-size:12px;font-weight:700;color:${theme.primary};border-bottom:1px solid #eee;white-space:nowrap;">${i + 1}</td>
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:${theme.primary};border-bottom:1px solid #eee;">${escapeHtml(item.segment)}</td>
      <td style="padding:9px 12px;font-size:11px;color:#666;border-bottom:1px solid #eee;">${escapeHtml(item.notes || '')}</td>
      <td style="padding:9px 12px;font-size:11px;color:#555;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;">${item.duration} min</td>
      <td style="padding:9px 12px;font-size:11px;color:${theme.primary};font-weight:500;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${item.timing || ''}</td>
    </tr>
  `).join('')

  return `
    <div style="width:${contentWidth}px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#333;">

      <!-- Header -->
      <div style="margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid ${theme.primary};">
        <h1 style="margin:0 0 10px;font-size:26px;font-weight:700;color:${theme.primary};">${escapeHtml(agendaData.title)}</h1>
        <div style="font-size:13px;color:#555;">
          <strong>Date:</strong> ${formatDate(agendaData.date)}
          ${agendaData.startTime ? `&nbsp;|&nbsp;<strong>Time:</strong> ${agendaData.startTime}${agendaData.endTime ? ' – ' + agendaData.endTime : ''}` : ''}
        </div>
        ${agendaData.location ? `<div style="font-size:12px;color:#666;margin-top:4px;"><strong>Location:</strong> ${escapeHtml(agendaData.location)}</div>` : ''}
        ${agendaData.moderator ? `<div style="font-size:12px;color:#666;margin-top:2px;"><strong>Moderator:</strong> ${escapeHtml(agendaData.moderator)}</div>` : ''}
      </div>

      <!-- Agenda Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;table-layout:fixed;">
        <colgroup>
          <col style="width:7%">
          <col style="width:28%">
          <col style="width:35%">
          <col style="width:14%">
          <col style="width:16%">
        </colgroup>
        <thead>
          <tr style="background:${theme.primary};color:#fff;">
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">S/N</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Segment</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Notes</th>
            <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Duration</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Timing</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <!-- Summary -->
      <div style="background:${theme.accent}18;border-left:4px solid ${theme.primary};border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:18px;">
        <div style="font-weight:700;color:${theme.primary};font-size:12px;margin-bottom:6px;">Meeting Summary</div>
        <div style="font-size:11px;color:#555;display:flex;gap:24px;flex-wrap:wrap;">
          <span>• <strong>${timings.length}</strong> agenda items</span>
          <span>• <strong>${totalMinutes} minutes</strong> total</span>
          ${meetingTypeLabel ? `<span>• ${meetingTypeLabel}</span>` : ''}
        </div>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #ddd;padding-top:10px;font-size:9px;color:#aaa;text-align:center;">
        Generated by BLW CAN NEXUS Meeting Planner &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' })}
      </div>
    </div>
  `
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
