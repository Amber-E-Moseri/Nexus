// Shared CORS helpers for edge functions.
// Usage: import { getCorsHeaders, jsonResponse, corsOptionsResponse } from '../_shared/cors.ts'

const PRIMARY_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''

// Origins always allowed regardless of env var (local dev + preview + production).
const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://nexus.lwcanada.org',
  'https://blwcannexus.vercel.app',
  'https://app.blwcannexus.ca',
])

// .claude/launch.json defines 10+ fallback dev ports (dev-alt through
// dev-alt11) specifically so concurrent local sessions in this repo don't
// collide on 5173 — but the fixed DEV_ORIGINS set above only ever covered
// two hardcoded ports. Any request that landed on one of the other fallback
// ports got silently CORS-blocked by the browser (fetch throws a generic
// "Failed to fetch" with no distinguishing detail, so this was invisible
// until traced from the actual origin). Matching any localhost/127.0.0.1
// port here closes that gap for every current and future fallback port
// without needing to hardcode each one — this only ever widens what's
// already allowed for local dev; it has no effect on PRIMARY_ORIGIN or the
// production domains above, which still require an exact match.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed =
    !PRIMARY_ORIGIN || // no restriction configured → wildcard
    origin === PRIMARY_ORIGIN ||
    DEV_ORIGINS.has(origin) ||
    LOCAL_DEV_ORIGIN.test(origin)

  return {
    'Access-Control-Allow-Origin': allowed ? origin || '*' : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

// Legacy export for functions that use static corsHeaders (falls back to wildcard if no env var).
export const corsHeaders = PRIMARY_ORIGIN
  ? {
      'Access-Control-Allow-Origin': PRIMARY_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Vary': 'Origin',
    }
  : {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    }

export function jsonResponse(status: number, body: Record<string, unknown>, headers?: Record<string, string>, req?: Request) {
  const cors = req ? getCorsHeaders(req) : corsHeaders
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function corsOptionsResponse(req: Request) {
  return new Response('ok', {
    status: 200,
    headers: getCorsHeaders(req),
  })
}
