// Server-side TTS cache client.
// Calls generate-tts edge function which checks Supabase Storage before calling OpenAI.
// Identical text + voice always maps to one cached file, shared across all users and sessions.

const urlCache = new Map() // voice:text → { audioUrl, expiresAt }
const SESSION_TTL = 50 * 60 * 1000 // 50 min — slightly less than signed URL's 1h TTL

const POLL_ATTEMPTS = 6
const POLL_BASE_MS = 500
const POLL_BACKOFF = 1.5

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchSegmentAudio(text, voice) {
  const inMemKey = `${voice}:${text}`
  const hit = urlCache.get(inMemKey)
  if (hit && Date.now() < hit.expiresAt) {
    return new Audio(hit.audioUrl)
  }

  const { supabase } = await import('../../../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL not set')

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice }),
    })

    const data = await res.json().catch(() => ({ status: 'failed', message: `HTTP ${res.status}` }))

    if (data.status === 'ready') {
      urlCache.set(inMemKey, { audioUrl: data.audioUrl, expiresAt: Date.now() + SESSION_TTL })
      return new Audio(data.audioUrl)
    }

    if (data.status === 'failed') {
      throw new Error(data.message || 'TTS generation failed')
    }

    // status === 'generating': back off and retry
    await delay(POLL_BASE_MS * Math.pow(POLL_BACKOFF, attempt))
  }

  throw new Error('TTS generation timed out after polling')
}

export function clearSessionCache() {
  urlCache.clear()
}
