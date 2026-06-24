import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

export interface RateLimitConfig {
  ipPerMinute?: number
  emailPerHour?: number
  endpoint: string
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
  limitType?: string
  currentCount?: number
  limit?: number
}

/**
 * Extract client IP address from request headers
 * Checks X-Forwarded-For first (for proxied requests), then falls back to origin
 */
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get('X-Forwarded-For')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const url = new URL(req.url)
  return url.hostname || 'unknown'
}

/**
 * Check if a request exceeds rate limits
 *
 * Returns { allowed: true } if under limit, or { allowed: false, retryAfterSeconds: N } if exceeded
 */
export async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string,
  email: string | undefined,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = new Date()
  const results: RateLimitResult[] = []

  // Check IP-based limit (per minute)
  if (config.ipPerMinute && config.ipPerMinute > 0) {
    const ipResult = await checkIpRateLimit(supabase, ipAddress, config.endpoint, config.ipPerMinute)
    results.push(ipResult)
    if (!ipResult.allowed) {
      // Log violation
      await supabase.from('rate_limit_violations').insert({
        ip_address: ipAddress,
        endpoint: config.endpoint,
        limit_type: 'ip_per_minute',
        current_count: ipResult.currentCount || 0,
        limit_value: config.ipPerMinute,
        created_at: now.toISOString(),
      }).catch(err => console.error('Failed to log rate limit violation:', err))
    }
  }

  // Check email-based limit (per hour)
  if (email && config.emailPerHour && config.emailPerHour > 0) {
    const emailResult = await checkEmailRateLimit(supabase, email, config.endpoint, config.emailPerHour)
    results.push(emailResult)
    if (!emailResult.allowed) {
      // Log violation
      await supabase.from('rate_limit_violations').insert({
        ip_address: ipAddress,
        email: email,
        endpoint: config.endpoint,
        limit_type: 'email_per_hour',
        current_count: emailResult.currentCount || 0,
        limit_value: config.emailPerHour,
        created_at: now.toISOString(),
      }).catch(err => console.error('Failed to log rate limit violation:', err))
    }
  }

  // If any limit is exceeded, return the most restrictive retry-after
  const blocked = results.find(r => !r.allowed)
  if (blocked) {
    return {
      allowed: false,
      limitType: blocked.limitType,
      retryAfterSeconds: blocked.retryAfterSeconds || 60,
      currentCount: blocked.currentCount,
      limit: blocked.limit,
    }
  }

  return { allowed: true }
}

/**
 * Check IP-based rate limit (10 requests per minute)
 */
async function checkIpRateLimit(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string,
  endpoint: string,
  limit: number,
): Promise<RateLimitResult> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000)

  const { data: existing, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('ip_address', ipAddress)
    .eq('endpoint', endpoint)
    .gt('window_start', oneMinuteAgo.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Rate limit check error:', error)
    // Fail open on DB errors to avoid blocking legitimate traffic
    return { allowed: true }
  }

  const record = existing?.[0]
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 1000) // 1 minute from now

  if (!record) {
    // First request in this window
    await supabase.from('rate_limits').insert({
      ip_address: ipAddress,
      endpoint,
      attempt_count: 1,
      window_start: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }).catch(err => console.error('Failed to create rate limit record:', err))

    return { allowed: true }
  }

  if (record.attempt_count < limit) {
    // Increment counter
    await supabase
      .from('rate_limits')
      .update({ attempt_count: record.attempt_count + 1, updated_at: now.toISOString() })
      .eq('id', record.id)
      .catch(err => console.error('Failed to increment rate limit counter:', err))

    return { allowed: true }
  }

  // Limit exceeded
  const retryAfter = Math.ceil((new Date(record.window_start).getTime() + 60 * 1000 - now.getTime()) / 1000)
  return {
    allowed: false,
    limitType: 'ip_per_minute',
    retryAfterSeconds: Math.max(retryAfter, 1),
    currentCount: record.attempt_count,
    limit,
  }
}

/**
 * Check email-based rate limit (20 requests per hour)
 */
async function checkEmailRateLimit(
  supabase: ReturnType<typeof createClient>,
  email: string,
  endpoint: string,
  limit: number,
): Promise<RateLimitResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const { data: existing, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('email', email)
    .eq('endpoint', endpoint)
    .gt('window_start', oneHourAgo.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Rate limit check error:', error)
    // Fail open on DB errors
    return { allowed: true }
  }

  const record = existing?.[0]
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now

  if (!record) {
    // First request in this window
    await supabase.from('rate_limits').insert({
      email,
      endpoint,
      attempt_count: 1,
      window_start: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }).catch(err => console.error('Failed to create rate limit record:', err))

    return { allowed: true }
  }

  if (record.attempt_count < limit) {
    // Increment counter
    await supabase
      .from('rate_limits')
      .update({ attempt_count: record.attempt_count + 1, updated_at: now.toISOString() })
      .eq('id', record.id)
      .catch(err => console.error('Failed to increment rate limit counter:', err))

    return { allowed: true }
  }

  // Limit exceeded
  const retryAfter = Math.ceil((new Date(record.window_start).getTime() + 60 * 60 * 1000 - now.getTime()) / 1000)
  return {
    allowed: false,
    limitType: 'email_per_hour',
    retryAfterSeconds: Math.max(retryAfter, 1),
    currentCount: record.attempt_count,
    limit,
  }
}
