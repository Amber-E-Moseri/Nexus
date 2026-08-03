const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|approx|dept|est|gov|inc|ltd|fig|vol|no|pp|ca|e\.g|i\.e)\./gi

export function splitSentences(text) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const safeText = normalized.replace(ABBREV, (m) => m.slice(0, -1) + '\x00')
  const parts = safeText.split(/(?<=[.!?][”"']?)\s+(?=[A-Z“"'\(])/)
  return parts
    .map((s) => s.replace(/\x00/g, '.').trim())
    .filter(Boolean)
}

export function countWords(text) {
  return text.trim().split(/\s+/).length
}

export function estimateMinutes(wordCount, wpm = 150) {
  return Math.max(1, Math.round(wordCount / wpm))
}
