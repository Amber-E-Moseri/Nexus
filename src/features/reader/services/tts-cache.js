const urlCache = new Map()
const SESSION_TTL = 50 * 60 * 1000
const POLL_ATTEMPTS = 12
const POLL_BASE_MS = 1000
const POLL_BACKOFF = 1.5
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchSegmentAudio(text, voice) {
  const inMemKey = `${voice}:${text}`
  const hit = urlCache.get(inMemKey)
  if (hit && Date.now() < hit.expiresAt) return new Audio(hit.audioUrl)

  const { supabase } = await import('../../../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-tts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    })

    if (!res.ok) {
      if (res.status === 402) {
        throw Object.assign(new Error('Out of listening credits'), { code: 'CREDIT_EXHAUSTED' })
      }
      if (res.status >= 500) {
        const body = await res.text().catch(() => '')
        console.error('[tts] 500 from generate-tts:', body)
        await delay(POLL_BASE_MS * Math.pow(POLL_BACKOFF, attempt))
        continue
      }
      const err = await res.json().catch(() => null)
      throw new Error(err?.message || `TTS error ${res.status}`)
    }

    const data = await res.json()
    if (data.status === 'ready') {
      urlCache.set(inMemKey, { audioUrl: data.audioUrl, expiresAt: Date.now() + SESSION_TTL })
      return new Audio(data.audioUrl)
    }
    if (data.status === 'failed') throw new Error(data.message || 'TTS generation failed')
    // status === 'generating' — back off and retry
    await delay(POLL_BASE_MS * Math.pow(POLL_BACKOFF, attempt))
  }
  throw new Error('TTS generation timed out after polling')
}

export function clearSessionCache() { urlCache.clear() }
