/**
 * Builds an array mapping sentence index → PDF page number.
 * Uses the charOffset field on textItems (from pdfjs-dist) to find which
 * page each sentence starts on. The approximation is accurate enough for
 * navigation — we binary-search textItems by charOffset against the
 * cumulative character position of each sentence in the full text.
 */
export function buildSentencePageMap(sentences, textItems) {
  if (!textItems?.length || !sentences?.length) return sentences?.map(() => 1) ?? []

  // Sort by charOffset (should already be in order, but guarantee it)
  const sorted = [...textItems].sort((a, b) => a.charOffset - b.charOffset)
  const result = []
  let approxOffset = 0

  for (const sentence of sentences) {
    // Binary search: find the greatest item with charOffset <= approxOffset
    let lo = 0, hi = sorted.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (sorted[mid].charOffset <= approxOffset) lo = mid
      else hi = mid - 1
    }
    result.push(sorted[lo]?.pageNum ?? 1)
    approxOffset += sentence.length + 1 // +1 for the space separator
  }

  return result
}

/** First sentence index that belongs to targetPage (or after it). */
export function sentenceIdxForPage(sentencePageMap, targetPage) {
  if (!sentencePageMap?.length) return 0
  const idx = sentencePageMap.findIndex((p) => p >= targetPage)
  return idx >= 0 ? idx : sentencePageMap.length - 1
}

/** Page number for a given sentence index. */
export function pageForSentence(sentencePageMap, sentenceIdx) {
  if (!sentencePageMap?.length) return 1
  const clamped = Math.max(0, Math.min(sentenceIdx, sentencePageMap.length - 1))
  return sentencePageMap[clamped] ?? 1
}
