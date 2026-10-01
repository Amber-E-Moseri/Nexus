// Tests for /api/growth-report-pdf authentication and authorization.
// Uses mocked Supabase, fs, and puppeteer so no real Chromium or network calls.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Track Chromium launch calls to verify it does NOT start on auth failures.
const launchMock = vi.fn()

vi.mock('puppeteer-core', () => ({
  default: { launch: launchMock },
}))

vi.mock('@sparticuz/chromium', () => ({
  default: {
    args: [],
    defaultViewport: null,
    executablePath: async () => '/fake/chromium',
    headless: true,
  },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(() => '<html>{{TABLE_ROWS}}{{CHART_SVG}}{{GENERATED_AT}}</html>'),
    existsSync: vi.fn(() => false),
  }
})

vi.mock('../lib/growthReportRenderer.js', () => ({
  renderGrowthReportHTMLWithTemplate: vi.fn(() => '<html>PDF content</html>'),
}))

// Supabase auth outcomes controlled per-test via these vars
let mockGetUser: () => Promise<{ data: { user: unknown }; error: unknown }>
let mockFromUsers: () => { data: unknown; error: unknown }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: (_token?: string) => mockGetUser(),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            table === 'users' ? mockFromUsers() : { data: null, error: 'wrong table' },
        }),
      }),
    }),
  }),
}))

// ── Helper: build fake request/response ───────────────────────────────────────

function makeReq(
  opts: {
    method?: string
    authorization?: string
    body?: unknown
  } = {},
) {
  return {
    method: opts.method ?? 'POST',
    headers: { authorization: opts.authorization ?? '' },
    body: opts.body,
  }
}

function makeRes() {
  const calls: { method: string; args: unknown[] }[] = []
  const res: Record<string, unknown> = {}

  res.status = vi.fn((code: number) => {
    calls.push({ method: 'status', args: [code] })
    return res
  })
  res.setHeader = vi.fn(() => res)
  res.json = vi.fn((body: unknown) => {
    calls.push({ method: 'json', args: [body] })
  })
  res.send = vi.fn((body: unknown) => {
    calls.push({ method: 'send', args: [body] })
  })
  res.end = vi.fn(() => {
    calls.push({ method: 'end', args: [] })
    return res
  })

  return { res: res as any, calls }
}

const VALID_REPORT = {
  reportingWeek: 'September 21, 2026',
  networkAttendance: 511,
  firstTimers: 38,
  attendanceDelta: 21,
  reportingCenters: 7,
  totalCenters: 10,
  reportingPercentage: 70,
  generatedAt: new Date().toISOString(),
  trend: [],
  centers: [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Growth PDF Endpoint — authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.VERCEL = '1' // triggers serverless path in getBrowserArgs, avoids findLocalChrome()
    // Default: valid super_admin session
    mockGetUser = async () => ({ data: { user: { id: 'user-123' } }, error: null })
    mockFromUsers = () => ({ data: { role: 'super_admin' }, error: null })
  })

  it('returns 401 when Authorization header is absent', async () => {
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: '' })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const statusCall = calls.find(c => c.method === 'status')
    expect(statusCall?.args[0]).toBe(401)
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('returns 401 for invalid / expired token', async () => {
    mockGetUser = async () => ({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer bad.token.here', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const statusCall = calls.find(c => c.method === 'status')
    expect(statusCall?.args[0]).toBe(401)
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('returns 403 for authenticated user without growth access', async () => {
    mockFromUsers = () => ({ data: { role: 'media' }, error: null })
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer valid.user.token', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const statusCall = calls.find(c => c.method === 'status')
    expect(statusCall?.args[0]).toBe(403)
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('allows super_admin', async () => {
    mockFromUsers = () => ({ data: { role: 'super_admin' }, error: null })
    launchMock.mockResolvedValue({
      newPage: async () => ({
        setContent: async () => {},
        pdf: async () => Buffer.from('%PDF-1.4 test'),
      }),
      close: async () => {},
    })
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer admin.token', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const statusCall = calls.find(c => c.method === 'status')
    expect(statusCall?.args[0]).toBe(200)
    expect(launchMock).toHaveBeenCalledOnce()
  })

  it('allows regional_secretary', async () => {
    mockFromUsers = () => ({ data: { role: 'regional_secretary' }, error: null })
    launchMock.mockResolvedValue({
      newPage: async () => ({
        setContent: async () => {},
        pdf: async () => Buffer.from('%PDF-1.4 test'),
      }),
      close: async () => {},
    })
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer rs.token', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const statusCall = calls.find(c => c.method === 'status')
    expect(statusCall?.args[0]).toBe(200)
    expect(launchMock).toHaveBeenCalledOnce()
  })
})

describe('Growth PDF Endpoint — payload validation (before Chromium)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    mockGetUser = async () => ({ data: { user: { id: 'user-123' } }, error: null })
    mockFromUsers = () => ({ data: { role: 'super_admin' }, error: null })
  })

  it('returns 400 and does not launch Chromium when body is missing', async () => {
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer token', body: null })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    expect(calls.find(c => c.method === 'status')?.args[0]).toBe(400)
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when reportingWeek is missing', async () => {
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({
      authorization: 'Bearer token',
      body: { networkAttendance: 100, centers: [] },
    })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    expect(calls.find(c => c.method === 'status')?.args[0]).toBe(400)
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when centers is not an array', async () => {
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({
      authorization: 'Bearer token',
      body: { reportingWeek: 'Test', networkAttendance: 100, centers: 'not-array' },
    })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    expect(calls.find(c => c.method === 'status')?.args[0]).toBe(400)
    expect(launchMock).not.toHaveBeenCalled()
  })
})

describe('Growth PDF Endpoint — sanitized error response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.VERCEL = '1'
    mockGetUser = async () => ({ data: { user: { id: 'user-123' } }, error: null })
    mockFromUsers = () => ({ data: { role: 'super_admin' }, error: null })
  })

  it('returns requestId in error response without raw details', async () => {
    launchMock.mockRejectedValue(new Error('Could not find Chrome at /var/task/secret/path'))
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer token', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const jsonCall = calls.find(c => c.method === 'json')
    const body = jsonCall?.args[0] as Record<string, unknown>
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof body.requestId).toBe('string')
    // Internal path/stack must not appear in client response
    expect(JSON.stringify(body)).not.toContain('/var/task')
    expect(JSON.stringify(body)).not.toContain('stack')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(JSON.stringify(body)).not.toContain('SUPABASE')
  })

  it('returns 401 without requestId leaking token or user info', async () => {
    mockGetUser = async () => ({ data: { user: null }, error: { message: 'jwt expired' } })
    const { default: handler } = await import('../../api/growth-report-pdf.js')
    const req = makeReq({ authorization: 'Bearer my.secret.jwt', body: VALID_REPORT })
    const { res, calls } = makeRes()
    await handler(req as any, res)
    const jsonCall = calls.find(c => c.method === 'json')
    const body = jsonCall?.args[0] as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain('my.secret.jwt')
    expect(JSON.stringify(body)).not.toContain('jwt expired')
  })
})
