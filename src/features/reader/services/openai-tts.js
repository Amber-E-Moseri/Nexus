const VOICE_TONE_API = { Nova: 'nova', Aurora: 'shimmer', Sage: 'fable' }
export const VOICE_TONE_LABELS = { Nova: 'Neutral', Aurora: 'Warm', Sage: 'Expressive' }

const cache = new Map()

export async function fetchSentenceAudio(text, tone = 'Nova') {
  const apiVoice = VOICE_TONE_API[tone] ?? 'nova'
  const key = `${apiVoice}:${text}`
  if (cache.has(key)) {
    return new Audio(cache.get(key))
  }
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('VITE_OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: apiVoice, input: text, response_format: 'mp3' }),
  })
  if (!res.ok) throw new Error(`TTS error ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  cache.set(key, url)
  return new Audio(url)
}

export function clearTTSCache() {
  for (const url of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
}
