/**
 * Layered, confidence-scored chapter detection.
 *
 * Priority:
 *  1. Embedded PDF outline (highest confidence, skip scoring if present)
 *  2. Confidence scoring: font size + layout gap + text pattern
 *  3. Fallback: fixed-size "Part N" chunking (unstructured text)
 */

const CHAPTER_CONFIDENCE_THRESHOLD = 0.65
const SENTENCES_PER_PART = 100
const DEBUG_CHAPTER_DETECTION = false

/** Returns [{ title, idx }] sorted by sentence index. */
export function detectChapters(sentences, textItems, pageSizes, outline) {
  if (!sentences?.length) return []

  // Signal 1: embedded outline
  if (outline?.length > 0) {
    const chapters = chaptersFromOutline(outline, sentences, textItems)
    if (chapters.length > 0) {
      if (DEBUG_CHAPTER_DETECTION) console.log('[chapters] outline hit:', chapters.length)
      return chapters
    }
  }

  // Signals 2-4: confidence scoring
  if (textItems?.length > 0 && pageSizes?.length > 0) {
    const scored = chaptersFromScoring(sentences, textItems, pageSizes)
    if (scored.length > 0) {
      if (DEBUG_CHAPTER_DETECTION) console.log('[chapters] scored hit:', scored.length)
      return scored
    }
  }

  // Fallback: Part N chunking
  return partChunks(sentences)
}

// ── Signal 1: outline ──────────────────────────────────────────────────────

function chaptersFromOutline(outline, sentences, textItems) {
  // outline: [{ title, pageNum }] from extractOutline in pdf-export.js
  // Map each entry to the first sentence on/after its page
  if (!Array.isArray(textItems)) return []
  const sorted = [...textItems].sort((a, b) => a.charOffset - b.charOffset)
  return outline
    .map(({ title, pageNum }) => {
      // Find first textItem on this page
      const firstItem = sorted.find((it) => it.pageNum >= pageNum)
      if (!firstItem) return null
      const idx = findSentenceAtOffset(sentences, firstItem.charOffset)
      return { title, idx }
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx)
}

// ── Signals 2-4: confidence scoring ───────────────────────────────────────

function chaptersFromScoring(sentences, textItems, pageSizes) {
  // Body-text size = most common text-item height (mode)
  const heightBuckets = {}
  for (const item of textItems) {
    const h = Math.round(item.height)
    if (h > 0) heightBuckets[h] = (heightBuckets[h] ?? 0) + 1
  }
  const bodySize = parseInt(
    Object.entries(heightBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12
  )

  // Group items into visual lines (same page + baseline within 3pt)
  const lines = groupByLine(textItems)

  const candidates = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const text = line.items.map((it) => it.text).join(' ').trim()
    if (!text || text.length > 120) continue // too long to be a heading

    let score = 0

    // Signal 2: font size
    const maxHeight = Math.max(...line.items.map((it) => it.height))
    if (maxHeight > bodySize * 1.3) score += 0.35
    else if (maxHeight > bodySize * 1.15) score += 0.15

    // Signal 2b: font name contains "bold" or heading indicator
    const fontName = (line.items[0]?.fontName ?? '').toLowerCase()
    if (fontName.includes('bold') || fontName.includes('head') || fontName.includes('title')) {
      score += 0.15
    }

    // Signal 3: vertical gap above (large gap = paragraph break before heading)
    if (i > 0 && lines[i - 1].pageNum === line.pageNum) {
      const gapAbove = lines[i - 1].y - line.y // baseline gap (PDF y decreases downward)
      const normalLeading = bodySize * 1.3
      if (gapAbove > normalLeading * 2.5) score += 0.25
      else if (gapAbove > normalLeading * 1.5) score += 0.10
    } else if (i > 0 && lines[i - 1].pageNum !== line.pageNum) {
      // First line on a new page — slight bonus
      score += 0.10
    }

    // Signal 3b: near top of page (top 25%)
    const pageH = pageSizes[line.pageNum - 1]?.height ?? 800
    if (line.y > pageH * 0.75) score += 0.12 // y is measured from bottom in PDF

    // Signal 3c: centered text (center within 12% of page center)
    const pageW = pageSizes[line.pageNum - 1]?.width ?? 600
    const lineLeft = Math.min(...line.items.map((it) => it.x))
    const lineRight = Math.max(...line.items.map((it) => it.x + it.width))
    const lineCenter = (lineLeft + lineRight) / 2
    if (Math.abs(lineCenter - pageW / 2) < pageW * 0.12) score += 0.12

    // Signal 4: text pattern match
    if (isChapterPattern(text)) score += 0.25

    if (DEBUG_CHAPTER_DETECTION) {
      console.log('[chapters]', JSON.stringify({
        text: text.slice(0, 50), score: score.toFixed(2), maxHeight, bodySize, fontName,
      }))
    }

    if (score >= CHAPTER_CONFIDENCE_THRESHOLD) {
      const idx = findSentenceAtOffset(sentences, Math.min(...line.items.map((it) => it.charOffset)))
      candidates.push({ title: text, idx, score })
    }
  }

  // Deduplicate: same sentence index → keep highest-scored title
  const byIdx = new Map()
  for (const c of candidates) {
    const existing = byIdx.get(c.idx)
    if (!existing || c.score > existing.score) byIdx.set(c.idx, c)
  }
  const deduped = [...byIdx.values()].sort((a, b) => a.idx - b.idx)

  // Sparse-but-nonzero: too few headings relative to book length is likely a detection miss
  const sparseThreshold = Math.max(2, Math.round(sentences.length / 150))
  if (deduped.length > 0 && deduped.length < sparseThreshold && sentences.length > 50) {
    console.warn('[chapters] Only', deduped.length, 'heading(s) detected in', sentences.length, 'sentences — falling back to Part N chunking')
    return []
  }

  return deduped
}

// ── Fallback ───────────────────────────────────────────────────────────────

function partChunks(sentences) {
  const chunks = []
  let part = 1
  for (let idx = 0; idx < sentences.length; idx += SENTENCES_PER_PART) {
    chunks.push({ title: `Part ${part}`, idx })
    part++
  }
  return chunks
}

// ── Helpers ────────────────────────────────────────────────────────────────

function groupByLine(textItems) {
  // Sort top-to-bottom within each page (higher y value = higher on page in PDF coords)
  const sorted = [...textItems].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum
    return b.y - a.y
  })

  const lines = []
  for (const item of sorted) {
    const last = lines[lines.length - 1]
    if (last && last.pageNum === item.pageNum && Math.abs(last.y - item.y) <= 3) {
      last.items.push(item)
    } else {
      lines.push({ pageNum: item.pageNum, y: item.y, items: [item] })
    }
  }
  return lines
}

function findSentenceAtOffset(sentences, targetCharOffset) {
  let cumOffset = 0
  for (let i = 0; i < sentences.length; i++) {
    const nextOffset = cumOffset + sentences[i].length + 1
    if (nextOffset > targetCharOffset || i === sentences.length - 1) return i
    cumOffset = nextOffset
  }
  return 0
}

function isChapterPattern(text) {
  const t = text.trim()
  return (
    /^(chapter|part|prologue|epilogue|introduction|preface|afterword|conclusion)\b/i.test(t) ||
    /^[A-Z\s\d]{4,40}$/.test(t) ||
    /^(chapter|part)\s+\d+/i.test(t) ||
    /^\d+\.\s+[A-Z]/i.test(t)
  )
}
