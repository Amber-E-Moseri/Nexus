export const VOICE_TONE_LABELS = { Nova: 'Neutral', Aurora: 'Warm', Sage: 'Expressive' }

// Session-level cache: maps from audioUrl → Audio object
// Survives across sentences, cleared on page refresh or book change
const sessionCache = new Map()

export async function fetchSentenceAudio(text, tone = 'Nova', bookId = null, segmentId = null) {
  // Get JWT token from Supabase
  const { supabase } = await import('../../../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  // Call generate-tts edge function: handles cache lookup, generation, and signed URLs
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL not set')

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice: tone,
      bookId: bookId || undefined,
      segmentId: segmentId || undefined,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `TTS error ${res.status}`)
  }

  const data = await res.json()

  // data.status: 'ready', 'generating', 'failed'
  if (data.status === 'generating') {
    throw new Error('Audio is generating, please retry in a moment')
  }
  if (data.status === 'failed' || !data.audioUrl) {
    throw new Error(data.message || 'Audio generation failed')
  }

  // Cache hit or miss is tracked server-side; we just know if it was cached
  console.log(`[TTS] ${data.cached ? 'cache hit' : 'cache miss'} (${data.duration}s)`)

  // Check session cache first (same signed URL)
  if (sessionCache.has(data.audioUrl)) {
    return new Audio(data.audioUrl)
  }

  // Create Audio object and cache it
  const audio = new Audio(data.audioUrl)
  sessionCache.set(data.audioUrl, audio)
  return audio
}

export function clearTTSCache() {
  sessionCache.clear()
}
