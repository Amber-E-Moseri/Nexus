// Vercel Serverless Function: Growth Report PDF Generation
// POST /api/growth-report-pdf
//
// Requires authenticated user with role: super_admin | regional_secretary.
// Returns a PDF blob on success.
// All error responses carry a requestId for server-log correlation.
// Internal details (paths, stacks, keys) are never surfaced to the client.

import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
import { renderGrowthReportHTMLWithTemplate } from '../src/lib/growthReportRenderer.js'
import type { GrowthReport } from '../src/lib/reportModels.js'

const ALLOWED_ROLES = new Set(['super_admin', 'regional_secretary'])

type VercelRequest  = IncomingMessage & { body?: unknown }
type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): VercelResponse
  json(body: unknown): void
  send(body: unknown): void
  end(): void
}

// ── Template ─────────────────────────────────────────────────────────────────

function loadTemplate(): string {
  // process.cwd() is /var/task on Vercel; includeFiles puts the template there.
  const templatePath = join(process.cwd(), 'src/lib/growthReportTemplate.html')
  return readFileSync(templatePath, 'utf-8') // throws on failure; caller logs
}

// ── Chrome ───────────────────────────────────────────────────────────────────

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
  throw new Error('No local Chrome found — install Chrome or deploy to Vercel.')
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
  return {
    executablePath: findLocalChrome(),
    headless: true as const,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function resolveIdentity(
  token: string,
  requestId: string,
): Promise<{ userId: string; role: string } | null> {
  const supabaseUrl    = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`[${requestId}] Missing SUPABASE env vars — cannot authorize`)
    return null
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Validate the caller's JWT against Supabase Auth
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return null

  // Fetch role via service-role client (bypasses RLS)
  const { data: ur } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!ur) return null

  return { userId: user.id, role: ur.role as string }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = randomUUID()

  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', requestId })
  }

  // ── Authentication ─────────────────────────────────────────────────────────
  const authHeader = (req.headers['authorization'] ?? '') as string
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', requestId })
  }

  let identity: { userId: string; role: string } | null
  try {
    identity = await resolveIdentity(token, requestId)
  } catch (e) {
    console.error(`[${requestId}] Auth resolution error:`, e)
    return res.status(500).json({ error: 'Server configuration error', requestId })
  }
  if (!identity) {
    return res.status(401).json({ error: 'Invalid or expired session', requestId })
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  if (!ALLOWED_ROLES.has(identity.role)) {
    return res.status(403).json({ error: 'Growth Tracking access required', requestId })
  }

  // ── Payload validation (before Chromium launches) ──────────────────────────
  const report = req.body as GrowthReport
  if (!report || typeof report !== 'object') {
    return res.status(400).json({ error: 'Invalid request body', requestId })
  }
  if (!report.reportingWeek || report.networkAttendance === undefined) {
    return res.status(400).json({ error: 'Missing required report fields', requestId })
  }
  if (!Array.isArray(report.centers)) {
    return res.status(400).json({ error: 'Report centers must be an array', requestId })
  }

  // ── PDF generation ─────────────────────────────────────────────────────────
  let browser = null
  let stage = 'init'
  try {
    stage = 'template-load'
    const templateStr = loadTemplate()

    stage = 'html-render'
    const html = renderGrowthReportHTMLWithTemplate(report, templateStr)

    stage = 'browser-launch'
    const launchArgs = await getBrowserArgs()
    browser = await puppeteer.launch(launchArgs)

    stage = 'pdf-render'
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
    // Full detail server-side only — paths, stacks, context — never in the response
    console.error(
      `[${requestId}] PDF failed stage=${stage} user=${identity.userId} week=${report?.reportingWeek}:`,
      error,
    )
    return res.status(500).json({
      error:     'Failed to generate growth report PDF',
      requestId, // matches the server log entry above
    })
  } finally {
    if (browser) {
      await browser.close().catch(e => console.error(`[${requestId}] Browser close error:`, e))
    }
  }
}
