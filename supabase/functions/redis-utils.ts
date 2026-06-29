import { Redis } from 'https://esm.sh/@upstash/redis'

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL') || '',
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '',
})

// ── Extraction cache (30 days) ────────────────────────────────────────────────
export async function getCachedExtraction(transcriptHash: string) {
  try {
    const key = `extraction:${transcriptHash}`
    const cached = await redis.get(key)
    return cached ? JSON.parse(cached as string) : null
  } catch (error) {
    console.warn('Failed to get extraction cache:', error)
    return null
  }
}

export async function setCachedExtraction(transcriptHash: string, extractedData: any) {
  try {
    const key = `extraction:${transcriptHash}`
    await redis.setex(key, 2592000, JSON.stringify(extractedData)) // 30 days
    console.log(`Cached extraction for ${transcriptHash}`)
  } catch (error) {
    console.warn('Failed to set extraction cache:', error)
  }
}

// ── Meeting state cache (1 hour) ──────────────────────────────────────────────
export async function getCachedMeetingState(meetingId: string) {
  try {
    const key = `meeting:${meetingId}`
    const cached = await redis.get(key)
    return cached ? JSON.parse(cached as string) : null
  } catch (error) {
    console.warn('Failed to get meeting cache:', error)
    return null
  }
}

export async function setCachedMeetingState(meetingId: string, state: any) {
  try {
    const key = `meeting:${meetingId}`
    await redis.setex(key, 3600, JSON.stringify(state)) // 1 hour
    console.log(`Cached meeting state for ${meetingId}`)
  } catch (error) {
    console.warn('Failed to set meeting cache:', error)
  }
}

export async function invalidateMeetingCache(meetingId: string) {
  try {
    const key = `meeting:${meetingId}`
    await redis.del(key)
    console.log(`Invalidated meeting cache for ${meetingId}`)
  } catch (error) {
    console.warn('Failed to invalidate meeting cache:', error)
  }
}

// ── Rate limiting (per user, daily) ───────────────────────────────────────────
export async function checkTranscriptionRateLimit(userId: string, limit = 10) {
  try {
    const key = `transcribe:${userId}:daily`
    const current = await redis.incr(key)

    if (current === 1) {
      // First request today, set expiry to tomorrow
      await redis.expire(key, 86400)
    }

    const remaining = Math.max(0, limit - current)
    const isLimited = current > limit

    return {
      allowed: !isLimited,
      current,
      limit,
      remaining,
    }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open — allow if Redis is down
    return { allowed: true, current: 0, limit, remaining: limit }
  }
}

export async function resetTranscriptionRateLimit(userId: string) {
  try {
    const key = `transcribe:${userId}:daily`
    await redis.del(key)
  } catch (error) {
    console.warn('Failed to reset rate limit:', error)
  }
}

// ── Utility: hash transcript for cache key ────────────────────────────────────
export async function hashTranscript(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
}
