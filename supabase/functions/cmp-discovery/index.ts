import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BASE = 'https://leaders.lwcanada.org/api'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ProbeResult {
  endpoint: string
  status: number | string
  error?: string
  sampleShape?: Record<string, unknown> | unknown[]
  itemCount?: number
  keys?: string[]
  rateLimit?: Record<string, string>
}

async function probeEndpoint(token: string, endpoint: string, params: Record<string, string> = {}): Promise<ProbeResult> {
  const url = new URL(`${BASE}${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })

    const rateLimit: Record<string, string> = {}
    if (res.headers.get('x-ratelimit-limit')) rateLimit['limit'] = res.headers.get('x-ratelimit-limit') || ''
    if (res.headers.get('x-ratelimit-remaining')) rateLimit['remaining'] = res.headers.get('x-ratelimit-remaining') || ''
    if (res.headers.get('x-ratelimit-reset')) rateLimit['reset'] = res.headers.get('x-ratelimit-reset') || ''

    if (res.status === 404) return { endpoint, status: 404, error: 'Not found' }
    if (res.status === 403) return { endpoint, status: 403, error: 'Forbidden' }
    if (!res.ok) return { endpoint, status: res.status, error: res.statusText }

    const data = await res.json()
    const isArray = Array.isArray(data)
    const items = isArray ? data : (data?.data || data?.items || [])
    const firstItem = isArray ? data[0] : items[0]

    return {
      endpoint,
      status: 200,
      sampleShape: firstItem ? (typeof firstItem === 'object' ? firstItem : { value: firstItem }) : null,
      itemCount: isArray ? data.length : (data?.data?.length || data?.items?.length || items.length || 1),
      keys: firstItem ? (typeof firstItem === 'object' ? Object.keys(firstItem) : ['value']) : [],
      ...(Object.keys(rateLimit).length > 0 && { rateLimit }),
    }
  } catch (e) {
    return {
      endpoint,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = Deno.env.get('REPORTS_API_TOKEN')
  if (!token) return json(500, { error: 'REPORTS_API_TOKEN secret not configured' })

  const probes: Array<{ path: string; params?: Record<string, string> }> = [
    // Phase 1: Members
    { path: '/members', params: { pageSize: '5' } },
    { path: '/members', params: { pageSize: '100' } },
    { path: '/search/members', params: { q: 'test' } },

    // Phase 2: Attendance / Check-ins
    { path: '/checkins', params: { limit: '10' } },
    { path: '/attendance-records', params: { limit: '10' } },
    { path: '/events', params: { pageSize: '5' } },
    { path: '/services', params: { pageSize: '5' } },

    // Phase 3: First-Timers & Pastoral Care
    { path: '/first-timers', params: { pageSize: '5' } },
    { path: '/follow-ups', params: { pageSize: '5' } },
    { path: '/pastoral-care', params: { pageSize: '5' } },

    // Phase 4: Leaders
    { path: '/leaders', params: { pageSize: '5' } },
    { path: '/roles', params: { pageSize: '5' } },

    // Phase 5: Forms
    { path: '/forms', params: { pageSize: '10' } },

    // Phase 6: Additional endpoints
    { path: '/units', params: { pageSize: '10' } },
    { path: '/units', params: { pageSize: '1000' } },  // full hierarchy
    { path: '/departments', params: { pageSize: '10' } },
    { path: '/cell-meetings', params: { pageSize: '10' } },
    { path: '/training-events', params: { pageSize: '10' } },
    { path: '/reports', params: { pageSize: '10' } },
  ]

  const results: ProbeResult[] = []

  for (const probe of probes) {
    const result = await probeEndpoint(token, probe.path, probe.params || {})
    results.push(result)
    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 100))
  }

  return json(200, {
    timestamp: new Date().toISOString(),
    base_url: BASE,
    probed_count: results.length,
    results,
    summary: {
      status_200: results.filter(r => r.status === 200).length,
      status_404: results.filter(r => r.status === 404).length,
      status_403: results.filter(r => r.status === 403).length,
      errors: results.filter(r => r.status === 'error').length,
    },
  })
})
