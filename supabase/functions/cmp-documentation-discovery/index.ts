/**
 * cmp-documentation-discovery
 *
 * Fetches one submission from the ICPLC documentation form and returns the
 * opaque field IDs (answers.*) with their inferred value shapes — no PII.
 *
 * Purpose: enables the team to build the field mapping table in cmpDocumentation.js
 * before writing the full cmp-documentation-sync edge function.
 *
 * Auth: service-role bearer token only (called manually by staff, not from the browser).
 * Method: GET (read-only, safe to run repeatedly).
 *
 * Usage:
 *   curl -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
 *        https://<project>.supabase.co/functions/v1/cmp-documentation-discovery
 *
 * Response:
 *   {
 *     "submissionCount": 42,
 *     "topLevelKeys": ["id", "createdAt", "answers", "member", "unit"],
 *     "memberKeys": ["fullName"],
 *     "unitKeys": ["name"],
 *     "fields": [
 *       { "key": "email_address_m55d", "shape": "non-empty string" },
 *       { "key": "immigration_status_xzy1", "shape": "enum candidate" },
 *       { "key": "documents_valid_nov_abc2", "shape": "boolean-like string" },
 *       ...
 *     ]
 *   }
 */

const DOCUMENTATION_FORM_URL =
  'https://leaders.lwcanada.org/api/forms/cmuj6atvq01v5rhwzjsu4xzgj/submissions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Classify a value's shape without returning the value itself.
// "boolean-like string" = exactly "Yes" / "No" / "true" / "false"
// "enum candidate"      = short string (≤60 chars), no spaces or looks like a slug
// "non-empty string"    = has content but doesn't fit enum heuristic
// "empty string"        = blank / whitespace only
// "null/absent"         = null or undefined
function classifyShape(value: unknown): string {
  if (value === null || value === undefined) return 'null/absent'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value !== 'string') return typeof value
  const v = value.trim()
  if (v === '') return 'empty string'
  const lower = v.toLowerCase()
  if (lower === 'yes' || lower === 'no' || lower === 'true' || lower === 'false') {
    return 'boolean-like string'
  }
  // Short token with no whitespace → likely an enum value
  if (v.length <= 60 && !/\s/.test(v)) return 'enum candidate'
  return 'non-empty string'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed — use GET' })

  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const platformToken = Deno.env.get('LEADERS_PLATFORM_TOKEN')

  if (!platformToken) {
    return json(500, { error: 'LEADERS_PLATFORM_TOKEN secret not configured in Supabase Vault' })
  }

  // Require service-role auth — this endpoint is for staff/admin use only
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return json(401, { error: 'Service-role authorization required' })
  }

  // Step 1: Get total count (pageSize=0 is not supported; fetch 1 to get pagination.total)
  let totalCount = 0
  let firstSubmission: Record<string, unknown> | null = null

  try {
    const res = await fetch(`${DOCUMENTATION_FORM_URL}?pageSize=1&page=1`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    })

    if (!res.ok) {
      const body = await res.text()
      return json(502, {
        error: 'CMP API fetch failed',
        status: res.status,
        detail: body.slice(0, 500),
      })
    }

    const payload = (await res.json()) as {
      data: Record<string, unknown>[]
      pagination?: { total?: number }
    }

    totalCount = payload.pagination?.total ?? payload.data.length
    firstSubmission = payload.data[0] ?? null
  } catch (err) {
    return json(502, { error: 'Network error fetching CMP API', detail: String(err) })
  }

  if (!firstSubmission) {
    return json(200, {
      submissionCount: 0,
      message: 'No submissions found — form may be empty or not yet open',
    })
  }

  // Step 2: Describe the structure — keys only, no values
  const topLevelKeys = Object.keys(firstSubmission)
  const answers = (firstSubmission.answers || {}) as Record<string, unknown>
  const member = firstSubmission.member as Record<string, unknown> | null
  const unit = firstSubmission.unit as Record<string, unknown> | null

  const fields = Object.entries(answers).map(([key, value]) => ({
    key,
    shape: classifyShape(value),
  }))

  return json(200, {
    submissionCount: totalCount,
    topLevelKeys,
    memberKeys: member ? Object.keys(member) : [],
    unitKeys: unit ? Object.keys(unit) : [],
    fields,
  })
})
