// Vercel Serverless Function: Growth Report PDF Rendering
// Renders HTML growth report to PDF using Puppeteer
//
// Usage:
//   POST /api/growth-report-pdf
//   Content-Type: application/json

import { VercelRequest, VercelResponse } from '@vercel/node'
import puppeteer from 'puppeteer'
import { renderGrowthReportHTML } from '../src/lib/growthReportRendererBackend'

async function renderReportHTML(report: any): Promise<string> {
  // Use canonical backend renderer (no duplicate code)
  return renderGrowthReportHTML(report)
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let browser = null
  try {
    const report = req.body

    // Validation
    if (!report.reportingWeek || report.networkAttendance === undefined) {
      return res.status(400).json({ error: 'Missing required report fields' })
    }

    // Render HTML
    const html = await renderReportHTML(report)

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.createPage()

    // Set content and wait for fonts/images
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Generate PDF with print settings
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
      preferCSSPageSize: true,
    })

    // Return PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="growth-report-${report.reportingWeek.replace(/[^a-z0-9]/gi, '_')}.pdf"`)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

    return res.status(200).send(pdfBuffer)
  } catch (error) {
    console.error('Error generating PDF:', error)
    return res.status(500).json({
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    // Always close browser
    if (browser) {
      await browser.close().catch(e => console.error('Browser close error:', e))
    }
  }
}
