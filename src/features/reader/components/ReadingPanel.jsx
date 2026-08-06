import { useEffect, useRef, useState, useCallback } from 'react'

const isHeading = (s) =>
  /^(chapter|part|prologue|epilogue|introduction|preface|afterword)\b/i.test(s.trim()) ||
  /^[A-Z\s\d]{4,40}$/.test(s.trim())

// ── Scroll mode ────────────────────────────────────────────────────────────
function ScrollView({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize, lineHeight, isPlaying }) {
  const activeRef = useRef(null)
  const highlighted = new Set(highlights.map((h) => h.sentenceIdx))
  // Auto-scroll is suppressed while the user is manually scrolling
  const autoScrollRef = useRef(true)
  const scrollTimerRef = useRef(null)
  const containerRef = useRef(null)

  // Re-enable auto-scroll 1.5 s after the user stops scrolling
  function handleScroll() {
    autoScrollRef.current = false
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      autoScrollRef.current = true
    }, 1500)
  }

  // Auto-scroll only when playing and not suppressed by manual scroll
  useEffect(() => {
    if (!isPlaying || !autoScrollRef.current) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIdx, isPlaying])

  // When the user clicks a sentence: seek there AND re-enable auto-scroll
  function handleSentenceClick(idx) {
    autoScrollRef.current = true
    clearTimeout(scrollTimerRef.current)
    onSeek?.(idx)
  }

  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { onSelectionChange(null); return }
    const text = sel.toString().trim()
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const node = range.startContainer.parentElement
    const idx = parseInt(node?.dataset?.idx ?? node?.closest('[data-idx]')?.dataset?.idx ?? '-1', 10)
    if (idx < 0) { onSelectionChange(null); return }
    onSelectionChange({ text, sentenceIdx: idx, rect })
  }

  return (
    <div ref={containerRef} className="im-reading-text" style={{ fontSize, lineHeight }} onMouseUp={handleMouseUp} onScroll={handleScroll}>
      {sentences.map((s, idx) => {
        if (isHeading(s) && s.trim().length < 50) {
          return (
            <div key={idx} ref={idx === currentIdx ? activeRef : null} data-idx={idx}
              style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--im-text-dim)', margin: '2.5rem 0 1.5rem', fontFamily: 'Inter, sans-serif' }}>
              {s.trim()}
            </div>
          )
        }
        let cls = 'im-sentence'
        if (idx < currentIdx) cls += ' im-sentence--heard'
        else if (idx === currentIdx) cls += ' im-sentence--active'
        if (highlighted.has(idx)) cls += ' im-sentence--highlighted'
        return (
          <span key={idx} ref={idx === currentIdx ? activeRef : null} className={cls} data-idx={idx}
            onClick={() => handleSentenceClick(idx)} style={{ cursor: 'pointer' }}>
            {s}{' '}
          </span>
        )
      })}
    </div>
  )
}

// ── Teleprompter / line-by-line mode ──────────────────────────────────────
function TeleprompterView({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize, lineHeight }) {
  const highlighted = new Set(highlights.map((h) => h.sentenceIdx))
  const prev = sentences[currentIdx - 1]
  const curr = sentences[currentIdx]
  const next = sentences[currentIdx + 1]

  function handleMouseUp(sentenceIdx) {
    return () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { onSelectionChange(null); return }
      const text = sel.toString().trim()
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      onSelectionChange({ text, sentenceIdx, rect })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 10%', gap: '2rem', userSelect: 'text' }}>
      {/* Previous sentence — dim, clickable to go back */}
      {prev && (
        <p
          data-idx={currentIdx - 1}
          onClick={() => onSeek?.(currentIdx - 1)}
          onMouseUp={handleMouseUp(currentIdx - 1)}
          style={{ fontSize: fontSize * 0.72, lineHeight, color: 'var(--im-text-xdim)', textAlign: 'center', cursor: 'pointer', opacity: 0.4, transition: 'opacity 0.3s', margin: 0, fontFamily: 'Georgia, serif' }}>
          {prev}
        </p>
      )}

      {/* Current sentence — full size, highlighted */}
      {curr && (
        <p
          data-idx={currentIdx}
          onMouseUp={handleMouseUp(currentIdx)}
          style={{ fontSize, lineHeight, color: 'var(--im-text)', textAlign: 'center', fontWeight: 600, margin: 0, fontFamily: 'Georgia, serif', background: highlighted.has(currentIdx) ? 'var(--im-highlight)' : 'transparent', borderRadius: 4, padding: '0 8px', transition: 'all 0.3s' }}>
          {curr}
        </p>
      )}

      {/* Next sentence — dim, clickable to skip ahead */}
      {next && (
        <p
          data-idx={currentIdx + 1}
          onClick={() => onSeek?.(currentIdx + 1)}
          onMouseUp={handleMouseUp(currentIdx + 1)}
          style={{ fontSize: fontSize * 0.72, lineHeight, color: 'var(--im-text-dim)', textAlign: 'center', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.3s', margin: 0, fontFamily: 'Georgia, serif' }}>
          {next}
        </p>
      )}

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
        {[-2, -1, 0, 1, 2].map((offset) => {
          const i = currentIdx + offset
          if (i < 0 || i >= sentences.length) return null
          return (
            <div key={i} onClick={() => onSeek?.(i)}
              style={{ width: offset === 0 ? 20 : 6, height: 6, borderRadius: 3, background: offset === 0 ? 'var(--im-blue)' : 'var(--im-border)', cursor: 'pointer', transition: 'all 0.3s' }} />
          )
        })}
      </div>
    </div>
  )
}

// ── Page-flip mode ─────────────────────────────────────────────────────────
const PAGE_SIZE = 6

function PageView({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize, lineHeight }) {
  const highlighted = new Set(highlights.map((h) => h.sentenceIdx))
  const totalPages = Math.ceil(sentences.length / PAGE_SIZE)
  const [page, setPage] = useState(() => Math.floor(currentIdx / PAGE_SIZE))
  const [flipping, setFlipping] = useState(false)
  const [flipDir, setFlipDir] = useState(null) // 'forward' | 'back'
  const [displayPage, setDisplayPage] = useState(() => Math.floor(currentIdx / PAGE_SIZE))
  const startX = useRef(null)

  // Follow audio playback — auto-flip when sentence advances past page boundary
  useEffect(() => {
    const targetPage = Math.floor(currentIdx / PAGE_SIZE)
    if (targetPage !== page && !flipping) triggerFlip(targetPage)
  }, [currentIdx])

  function triggerFlip(next) {
    if (next < 0 || next >= totalPages || flipping) return
    const dir = next > page ? 'forward' : 'back'
    setFlipDir(dir)
    setFlipping(true)
    // Halfway through, swap the displayed page
    setTimeout(() => setDisplayPage(next), 200)
    setTimeout(() => { setPage(next); setFlipping(false) }, 420)
  }

  function goPage(next) { triggerFlip(next) }

  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { onSelectionChange(null); return }
    const text = sel.toString().trim()
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const node = range.startContainer.parentElement
    const idx = parseInt(node?.dataset?.idx ?? node?.closest('[data-idx]')?.dataset?.idx ?? '-1', 10)
    if (idx < 0) { onSelectionChange(null); return }
    onSelectionChange({ text, sentenceIdx: idx, rect })
  }

  function handleTouchStart(e) { startX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    startX.current = null
    if (Math.abs(dx) < 40) return
    dx < 0 ? goPage(page + 1) : goPage(page - 1)
  }

  const start = displayPage * PAGE_SIZE
  const pageSentences = sentences.slice(start, start + PAGE_SIZE)

  // 3D book flip: page rotates around vertical axis (like turning a book page)
  const flipAngle = flipping
    ? (flipDir === 'forward' ? 'rotateY(-180deg)' : 'rotateY(180deg)')
    : 'rotateY(0deg)'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Tap zones */}
      <div onClick={() => goPage(page - 1)} style={{ position: 'absolute', left: 0, top: 0, width: '18%', height: '100%', zIndex: 2, cursor: page > 0 ? 'w-resize' : 'default' }} />
      <div onClick={() => goPage(page + 1)} style={{ position: 'absolute', right: 0, top: 0, width: '18%', height: '100%', zIndex: 2, cursor: page < totalPages - 1 ? 'e-resize' : 'default' }} />

      {/* Book page with 3D flip */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4px 12px', perspective: '1200px' }}>
        <div style={{
          width: '100%', maxWidth: 640,
          transform: flipAngle,
          transformOrigin: flipDir === 'forward' ? 'left center' : 'right center',
          transition: flipping ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          backfaceVisibility: 'hidden',
        }}>
          <div className="im-reading-text" style={{ fontSize, lineHeight }} onMouseUp={handleMouseUp}>
            {pageSentences.map((s, i) => {
              const idx = start + i
              if (isHeading(s) && s.trim().length < 50) {
                return (
                  <div key={idx} data-idx={idx}
                    style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--im-text-dim)', margin: '1.5rem 0 1rem', fontFamily: 'Inter, sans-serif' }}>
                    {s.trim()}
                  </div>
                )
              }
              let cls = 'im-sentence'
              if (idx < currentIdx) cls += ' im-sentence--heard'
              else if (idx === currentIdx) cls += ' im-sentence--active'
              if (highlighted.has(idx)) cls += ' im-sentence--highlighted'
              return (
                <span key={idx} className={cls} data-idx={idx} onClick={() => onSeek?.(idx)} style={{ cursor: 'pointer' }}>
                  {s}{' '}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Page indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '10px 0 6px', flexShrink: 0 }}>
        <button onClick={() => goPage(page - 1)} disabled={page === 0 || flipping}
          style={{ background: 'none', border: 'none', cursor: page > 0 ? 'pointer' : 'default', color: page > 0 ? 'var(--im-blue)' : 'var(--im-border)', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>
          ‹
        </button>
        <span style={{ fontSize: 11, color: 'var(--im-text-dim)', fontWeight: 600, fontFamily: 'Inter, sans-serif', minWidth: 60, textAlign: 'center' }}>
          {displayPage + 1} / {totalPages}
        </span>
        <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1 || flipping}
          style={{ background: 'none', border: 'none', cursor: page < totalPages - 1 ? 'pointer' : 'default', color: page < totalPages - 1 ? 'var(--im-blue)' : 'var(--im-border)', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>
          ›
        </button>
      </div>
    </div>
  )
}

// ── Public export ──────────────────────────────────────────────────────────
export default function ReadingPanel({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize = 24, lineHeight = 1.8, viewMode = 'scroll', isPlaying = false }) {
  if (viewMode === 'pages') {
    return <PageView sentences={sentences} currentIdx={currentIdx} highlights={highlights} onSelectionChange={onSelectionChange} onSeek={onSeek} fontSize={Math.min(fontSize, 20)} lineHeight={lineHeight} />
  }
  if (viewMode === 'teleprompter') {
    return <TeleprompterView sentences={sentences} currentIdx={currentIdx} highlights={highlights} onSelectionChange={onSelectionChange} onSeek={onSeek} fontSize={fontSize} lineHeight={lineHeight} />
  }
  return <ScrollView sentences={sentences} currentIdx={currentIdx} highlights={highlights} onSelectionChange={onSelectionChange} onSeek={onSeek} fontSize={fontSize} lineHeight={lineHeight} isPlaying={isPlaying} />
}
