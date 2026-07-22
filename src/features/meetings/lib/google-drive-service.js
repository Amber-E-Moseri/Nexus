import { supabase } from '../../../lib/supabase'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

/**
 * Google Drive integration service for exporting meeting reports
 * Handles OAuth setup, folder management, and PDF uploads
 */

const NEXUS_REPORTS_FOLDER_NAME = 'Nexus Reports'
const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com'

/**
 * Check if user has Google Drive authorization
 * Returns provider_token if authorized, null otherwise
 */
export async function checkGoogleDriveAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) return null
    return session.provider_token || null
  } catch (err) {
    return null
  }
}

/**
 * Initiate Google Drive OAuth flow
 * Prompts user to authorize access to Google Drive
 */
export async function setupGoogleDriveAuth() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: ['https://www.googleapis.com/auth/drive.file'],
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) throw error
    return { success: true, data }
  } catch (err) {
    throw new Error(`Failed to authorize Google Drive: ${err.message}`)
  }
}

/**
 * Get or create the Nexus Reports folder in Google Drive
 * Returns folder ID for use in uploads
 */
export async function ensureNexusReportFolder(accessToken) {
  try {
    // Search for existing Nexus Reports folder
    const searchResponse = await fetch(
      `${GOOGLE_DRIVE_API_URL}/drive/v3/files?q=name='${NEXUS_REPORTS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id,name)&pageSize=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.statusText}`)
    }

    const searchData = await searchResponse.json()

    // If folder exists, return its ID
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id
    }

    // If not, create it
    const createResponse = await fetch(`${GOOGLE_DRIVE_API_URL}/drive/v3/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: NEXUS_REPORTS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })

    if (!createResponse.ok) {
      throw new Error(`Folder creation failed: ${createResponse.statusText}`)
    }

    const createData = await createResponse.json()
    return createData.id
  } catch (err) {
    throw new Error(`Failed to access Google Drive folder: ${err.message}`)
  }
}

/**
 * Generate PDF from meeting report HTML
 * Creates a formatted PDF document from the report data
 */
export async function generateReportPdf(report, reportElement) {
  let restoreDisplay = null
  let restoreWidth = null
  try {
    let canvas

    // If an HTML element is provided, convert it to canvas
    if (reportElement && typeof reportElement === 'object' && reportElement.nodeType === 1) {
      // #print-report is `display: none` outside of @media print, which makes
      // html2canvas render a blank canvas. Force it visible for the capture.
      const priorDisplay = reportElement.style.display
      const priorWidth = reportElement.style.width
      reportElement.style.display = 'block'
      reportElement.style.width = '816px' // Match print page width (A4 at ~96dpi)
      restoreDisplay = () => { reportElement.style.display = priorDisplay }
      restoreWidth = () => { reportElement.style.width = priorWidth }

      // Wait a frame for layout to settle
      await new Promise(resolve => setTimeout(resolve, 100))

      canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        windowHeight: reportElement.scrollHeight, // Capture full height
      })

      restoreDisplay()
      restoreDisplay = null
      if (restoreWidth) restoreWidth()
      restoreWidth = null
    } else {
      // Fallback: Create a simple formatted text document
      canvas = await createSimpleReportCanvas(report)
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const padding = 10

    // Calculate image dimensions to fit page
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const ratio = canvasWidth / canvasHeight
    const imgWidth = pageWidth - padding * 2
    const imgHeight = imgWidth / ratio

    // Slice the full-length image into page-sized chunks. jsPDF has no native
    // clipping for addImage, so each page redraws the same full image shifted
    // upward by one page height — the page boundaries themselves crop it.
    const contentHeightPerPage = pageHeight - padding * 2
    const totalPages = Math.max(1, Math.ceil(imgHeight / contentHeightPerPage))

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage()
      const yPosition = padding - page * contentHeightPerPage
      pdf.addImage(imgData, 'PNG', padding, yPosition, imgWidth, imgHeight)
    }

    return pdf.output('blob')
  } catch (err) {
    throw new Error(`Failed to generate PDF: ${err.message}`)
  } finally {
    if (restoreDisplay) restoreDisplay()
    if (restoreWidth) restoreWidth()
  }
}

/**
 * Create a simple text-based PDF canvas for fallback
 * Used when HTML element is not available for canvas conversion
 */
async function createSimpleReportCanvas(report) {
  // Check if document is available (browser environment)
  if (typeof document === 'undefined') {
    // In test/Node.js environment, return a mock canvas
    return {
      width: 800,
      height: 1000,
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 1000

  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#2D1B69'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('BLW CAN NEXUS', 40, 50)

  ctx.fillStyle = '#000000'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText('Meeting Report', 40, 100)

  let yPosition = 150
  const lineHeight = 30

  ctx.font = '14px sans-serif'

  const data = [
    [`Title: ${report.label || 'Unknown'}`, `Date: ${new Date().toLocaleDateString()}`],
    [`Expected: ${report.expectedCount || 0}`, `Attended: ${report.attendedCount || 0}`],
    [`Absent: ${report.absentCount || 0}`, `New: ${report.unexpectedCount || 0}`],
    [`Reach: ${Math.round((report.reachPct || 0) * 100)}%`, ''],
  ]

  for (const [left, right] of data) {
    ctx.fillText(left, 40, yPosition)
    if (right) {
      ctx.fillText(right, 420, yPosition)
    }
    yPosition += lineHeight
  }

  // Add present list
  yPosition += 20
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('Present Members', 40, yPosition)
  yPosition += 20
  ctx.font = '12px sans-serif'

  const presentNames = (report.present || []).map((p) => p.name)
  for (const name of presentNames.slice(0, 20)) {
    ctx.fillText(`• ${name}`, 60, yPosition)
    yPosition += 20
    if (yPosition > 900) break
  }

  return canvas
}

/**
 * Upload a PDF blob to Google Drive
 * Creates a file in the Nexus Reports folder
 */
export async function uploadReportToDrive(pdfBlob, fileName, accessToken, folderId) {
  try {
    const metadata = {
      name: fileName,
      mimeType: 'application/pdf',
      parents: [folderId],
    }

    const form = new FormData()
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    )
    form.append('file', pdfBlob)

    const response = await fetch(
      `${GOOGLE_DRIVE_API_URL}/upload/drive/v3/files?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || `Upload failed: ${response.statusText}`)
    }

    const result = await response.json()
    return {
      fileId: result.id,
      fileName: result.name,
      webViewLink: result.webViewLink,
    }
  } catch (err) {
    throw new Error(`Failed to upload report to Google Drive: ${err.message}`)
  }
}

/**
 * Complete export workflow
 * Checks auth, generates PDF, ensures folder exists, and uploads file
 */
export async function exportReportToGoogleDrive(report, reportElement, fileName) {
  try {
    // Step 1: Check if user has Google Drive auth
    let accessToken = await checkGoogleDriveAuth()

    if (!accessToken) {
      // Redirect to OAuth flow and throw error
      await setupGoogleDriveAuth()
      throw new Error('Please authorize Google Drive access and try again')
    }

    // Step 2: Generate PDF
    const pdfBlob = await generateReportPdf(report, reportElement)

    // Step 3: Ensure folder exists
    const folderId = await ensureNexusReportFolder(accessToken)

    // Step 4: Upload to Drive
    const result = await uploadReportToDrive(pdfBlob, fileName, accessToken, folderId)

    return {
      success: true,
      fileId: result.fileId,
      fileName: result.fileName,
      webViewLink: result.webViewLink,
    }
  } catch (err) {
    throw err
  }
}
