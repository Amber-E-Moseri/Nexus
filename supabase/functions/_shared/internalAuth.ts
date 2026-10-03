// Trusted-internal-caller authentication for cron / DB-trigger → Edge Function calls.
//
// WHY NOT `token === SUPABASE_SERVICE_ROLE_KEY`?
// This project has both legacy JWT and new opaque API keys active. Inside an Edge
// Function SUPABASE_SERVICE_ROLE_KEY resolves to the NEW-format key, but the gateway
// only admits the LEGACY key as `apikey`, so a pg_cron / trigger caller can never
// present a Bearer token equal to it (see migration 20270724000204). The repository's
// canonical hosted pattern (Growth, recurring meetings) is therefore:
//   apikey: <legacy key from app_settings>   -> satisfies the gateway
//   Authorization: Bearer <CRON_SHARED_SECRET> -> checked HERE, independent of key rotation
//
// Fails closed: if neither secret is configured, nobody is trusted.
// Never logs token values. The public anon key / any user JWT is never trusted.

const enc = new TextEncoder()

/** Constant-time string comparison (no early exit on first differing byte). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a)
  const y = enc.encode(b)
  const len = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export interface InternalSecrets {
  serviceRoleKey?: string | null
  cronSecret?: string | null
}

export type CallerClass = 'trusted' | 'missing' | 'untrusted' | 'unconfigured'

/** Classify the caller from the Authorization header ONLY (JWT claims are never trusted). */
export function classifyCaller(req: Request, secrets: InternalSecrets): CallerClass {
  const configured = [secrets.serviceRoleKey, secrets.cronSecret].filter(
    (s): s is string => typeof s === 'string' && s.length >= 16,
  )
  if (configured.length === 0) return 'unconfigured'
  const header = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!m) return 'missing'
  const token = m[1].trim()
  let ok = false
  for (const s of configured) if (safeEqual(token, s)) ok = true // no short-circuit
  return ok ? 'trusted' : 'untrusted'
}

/** Edge-runtime convenience: true only for the service-role key or CRON_SHARED_SECRET. */
export function isTrustedInternalCaller(req: Request): boolean {
  return (
    classifyCaller(req, {
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      cronSecret: Deno.env.get('CRON_SHARED_SECRET'),
    }) === 'trusted'
  )
}
