import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { THEME_OPTIONS } from '../data/agendaTemplates'

export async function generateAgendaPdf(agendaData, agendaItems, timings, filename = 'agenda.pdf') {
  try {
    // Get theme colors
    const theme = THEME_OPTIONS.find((t) => t.id === agendaData.theme) || THEME_OPTIONS[0]

    // Create temporary container for rendering
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.width = '8.5in'
    container.style.background = theme.background
    container.style.padding = '0.6in'
    container.style.fontFamily = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    container.style.color = '#333'
    container.style.lineHeight = '1.6'

    // Build HTML content
    const html = buildPdfHtml(agendaData, timings, theme)
    container.innerHTML = html

    document.body.appendChild(container)

    // Convert to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: theme.background,
      logging: false,
      width: 612, // 8.5in at 72 DPI
    })

    document.body.removeChild(container)

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    })

    const imgData = canvas.toDataURL('image/png')
    const imgWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0

    // Add image to PDF with page breaks if needed
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdf.internal.pageSize.getHeight()

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()
    }

    // Add page numbers
    const pageCount = pdf.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i += 1) {
      pdf.setPage(i)
      pdf.setFontSize(10)
      pdf.setTextColor(150, 150, 150)
      pdf.text(
        `Page ${i} of ${pageCount}`,
        pdf.internal.pageSize.getWidth() / 2,
        pdf.internal.pageSize.getHeight() - 0.4 * 72,
        { align: 'center' }
      )
    }

    // Download
    pdf.save(filename)

    return { success: true, message: 'PDF exported successfully' }
  } catch (error) {
    console.error('PDF generation error:', error)
    throw new Error(`Failed to generate PDF: ${error.message}`)
  }
}

function buildPdfHtml(agendaData, timings, theme) {
  const totalMinutes = timings.reduce((sum, item) => sum + item.duration, 0)

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
      <!-- Header -->
      <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid ${theme.primary};">
        <h1 style="margin: 0 0 12px 0; font-size: 28px; font-weight: 700; color: ${theme.primary};">
          ${escapeHtml(agendaData.title)}
        </h1>
        <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
          <strong>Date:</strong> ${formatDate(agendaData.date)} |
          <strong>Time:</strong> ${agendaData.startTime} - ${agendaData.endTime}
        </div>
        ${agendaData.location ? `
          <div style="font-size: 13px; color: #666; margin-bottom: 4px;">
            <strong>Location:</strong> ${escapeHtml(agendaData.location)}
          </div>
        ` : ''}
        ${agendaData.moderator ? `
          <div style="font-size: 13px; color: #666;">
            <strong>Moderator:</strong> ${escapeHtml(agendaData.moderator)}
          </div>
        ` : ''}
      </div>

      <!-- Agenda Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: ${theme.primary}; color: white;">
            <th style="padding: 12px; text-align: left; font-weight: 700; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid ${theme.primary}; width: 8%;">S/N</th>
            <th style="padding: 12px; text-align: left; font-weight: 700; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid ${theme.primary}; width: 28%;">Segment</th>
            <th style="padding: 12px; text-align: left; font-weight: 700; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid ${theme.primary}; width: 32%;">Notes</th>
            <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid ${theme.primary}; width: 12%;">Duration</th>
            <th style="padding: 12px; text-align: right; font-weight: 700; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid ${theme.primary}; width: 20%;">Timing</th>
          </tr>
        </thead>
        <tbody>
          ${timings.map((item, index) => `
            <tr style="background-color: ${index % 2 === 0 ? 'white' : `${theme.accent}40`}; border: 1px solid ${theme.primary}20;">
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: ${theme.primary}; border: 1px solid ${theme.primary}20;">
                ${index + 1}
              </td>
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: ${theme.primary}; border: 1px solid ${theme.primary}20;">
                ${escapeHtml(item.segment)}
              </td>
              <td style="padding: 10px 12px; font-size: 11px; color: #666; border: 1px solid ${theme.primary}20;">
                ${escapeHtml(item.notes || '')}
              </td>
              <td style="padding: 10px 12px; font-size: 11px; color: #666; text-align: center; border: 1px solid ${theme.primary}20;">
                ${item.duration} min
              </td>
              <td style="padding: 10px 12px; font-size: 11px; color: ${theme.primary}; font-weight: 500; text-align: right; border: 1px solid ${theme.primary}20;">
                ${item.timing}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Summary -->
      <div style="background-color: ${theme.accent}20; border-left: 4px solid ${theme.primary}; padding: 12px 16px; font-size: 12px; margin-bottom: 16px;">
        <strong style="color: ${theme.primary};">Meeting Summary</strong>
        <div style="margin-top: 6px; color: #666; font-size: 11px;">
          <div>• Total Items: ${timings.length}</div>
          <div>• Total Duration: ${totalMinutes} minutes</div>
          <div>• Meeting Type: ${agendaData.meetingType.replace(/_/g, ' ')}</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #999; text-align: center;">
        Generated by BLW CAN NEXUS Meeting Planner | ${new Date().toLocaleDateString()}
      </div>
    </div>
  `
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
