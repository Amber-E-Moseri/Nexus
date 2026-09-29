// Vercel Serverless Function: Growth Report PDF Rendering
// POST /api/growth-report-pdf
// Orchestrates Chromium PDF generation using the canonical renderer.

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import puppeteer from 'puppeteer-core'
import { renderGrowthReportHTMLWithTemplate } from '../src/lib/growthReportRenderer.js'
import type { GrowthReport } from '../src/lib/reportModels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadTemplate(): string {
  const templatePath = join(__dirname, '../src/lib/growthReportTemplate.html')
  try {
    return readFileSync(templatePath, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot load report template at ${templatePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function findLocalChrome(): string {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('No local Chrome/Chromium found for local PDF generation. Install Chrome or deploy to Vercel.')
}

async function getBrowserArgs() {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  if (isServerless) {
    const chromium = await import('@sparticuz/chromium')
    return {
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless as true,
    }
  }
  // Local development: find system Chrome
  return {
    executablePath: findLocalChrome(),
    headless: true as const,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
}

// Minimal request/response shapes (type-only; avoids a dependency on @vercel/node types)
interface VercelRequest { method?: string; body?: unknown }
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): VercelResponse
  json(body: unknown): VercelResponse
  send(body: unknown): VercelResponse
  end(): VercelResponse
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const report = req.body as GrowthReport

  if (!report?.reportingWeek || report.networkAttendance === undefined) {
    return res.status(400).json({ error: 'Missing required report fields' })
  }

  let browser = null
  try {
    const templateStr = loadTemplate()
    const html = renderGrowthReportHTMLWithTemplate(report, templateStr)

    const launchArgs = await getBrowserArgs()
    browser = await puppeteer.launch(launchArgs)

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
      preferCSSPageSize: true,
    })

    const safeFilename = `growth-report-${report.reportingWeek.replace(/[^a-z0-9]/gi, '_')}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

    return res.status(200).send(pdfBuffer)
  } catch (error) {
    console.error('Growth report PDF error:', error)
    const isProduction = !!process.env.VERCEL
    return res.status(500).json({
      error: 'Failed to generate PDF',
      ...(isProduction ? {} : { details: error instanceof Error ? error.message : String(error) }),
    })
  } finally {
    if (browser) {
      await browser.close().catch(e => console.error('Browser close error:', e))
    }
  }
}
