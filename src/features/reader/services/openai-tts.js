export const VOICE_TONE_LABELS = { Nova: 'Neutral', Aurora: 'Warm', Sage: 'Expressive' }

const cache = new Map()

export async function fetchSentenceAudio(text, tone = 'Nova') {
  const key = `${tone}:${text}`
  if (cache.has(key)) {
    return new Audio(cache.get(key))
  }

  // Get JWT token from Supabase
  const { supabase } = await import('../../../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  // Call edge function to avoid exposing OpenAI key to browser
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL not set')

  const res = await fetch(`${supabaseUrl}/functions/v1/immerse-tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, voice: tone }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `TTS error ${res.status}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  cache.set(key, url)
  return new Audio(url)
}

export function clearTTSCache() {
  for (const url of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
}
