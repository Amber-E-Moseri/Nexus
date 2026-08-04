import { useEffect, useRef, useState, useCallback } from 'react'

const isHeading = (s) =>
  /^(chapter|part|prologue|epilogue|introduction|preface|afterword)\b/i.test(s.trim()) ||
  /^[A-Z\s\d]{4,40}$/.test(s.trim())

// ── Scroll mode ────────────────────────────────────────────────────────────
function ScrollView({ sentences, currentIdx, highlights, onSelectionChange, fontSize, lineHeight }) {
  const activeRef = useRef(null)
  const highlighted = new Set(highlights.map((h) => h.sentenceIdx))

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIdx])

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
    <div className="im-reading-text" style={{ fontSize, lineHeight }} onMouseUp={handleMouseUp}>
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
          <span key={idx} ref={idx === currentIdx ? activeRef : null} className={cls} data-idx={idx}>
            {s}{' '}
          </span>
        )
      })}
    </div>
  )
}

// ── Page-flip mode ─────────────────────────────────────────────────────────
const PAGE_SIZE = 6 // sentences per page

function PageView({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize, lineHeight }) {
  const highlighted = new Set(highlights.map((h) => h.sentenceIdx))
  const totalPages = Math.ceil(sentences.length / PAGE_SIZE)
  const [page, setPage] = useState(() => Math.floor(currentIdx / PAGE_SIZE))
  const [direction, setDirection] = useState(null) // 'forward' | 'back'
  const [animating, setAnimating] = useState(false)
  const startX = useRef(null)

  // Follow currentIdx as audio plays
  useEffect(() => {
    const targetPage = Math.floor(currentIdx / PAGE_SIZE)
    if (targetPage !== page) {
      setDirection(targetPage > page ? 'forward' : 'back')
      setAnimating(true)
      setTimeout(() => { setPage(targetPage); setAnimating(false) }, 220)
    }
  }, [currentIdx])

  function goPage(next) {
    if (next < 0 || next >= totalPages || animating) return
    setDirection(next > page ? 'forward' : 'back')
    setAnimating(true)
    setTimeout(() => { setPage(next); setAnimating(false) }, 220)
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

  function handleTouchStart(e) { startX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    startX.current = null
    if (Math.abs(dx) < 40) return
    dx < 0 ? goPage(page + 1) : goPage(page - 1)
  }

  const start = page * PAGE_SIZE
  const pageSentences = sentences.slice(start, start + PAGE_SIZE)

  const slideStyle = animating ? {
    animation: `im-page-${direction === 'forward' ? 'out-left' : 'out-right'} 0.22s ease forwards`,
  } : {}

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Tap zones — left/right half to flip */}
      <div onClick={() => goPage(page - 1)} style={{ position: 'absolute', left: 0, top: 0, width: '20%', height: '100%', zIndex: 1, cursor: page > 0 ? 'w-resize' : 'default' }} />
      <div onClick={() => goPage(page + 1)} style={{ position: 'absolute', right: 0, top: 0, width: '20%', height: '100%', zIndex: 1, cursor: page < totalPages - 1 ? 'e-resize' : 'default' }} />

      {/* Page content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 4px' }}>
      <div className="im-reading-text" style={{ fontSize, lineHeight, width: '100%', ...slideStyle }}
        onMouseUp={handleMouseUp}>
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

      {/* Page indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0 6px', flexShrink: 0 }}>
        <button onClick={() => goPage(page - 1)} disabled={page === 0 || animating}
          style={{ background: 'none', border: 'none', cursor: page > 0 ? 'pointer' : 'default', color: page > 0 ? 'var(--im-blue)' : 'var(--im-border)', fontSize: 18, lineHeight: 1, padding: '0 8px' }}>
          ‹
        </button>
        <span style={{ fontSize: 11, color: 'var(--im-text-dim)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
          {page + 1} / {totalPages}
        </span>
        <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1 || animating}
          style={{ background: 'none', border: 'none', cursor: page < totalPages - 1 ? 'pointer' : 'default', color: page < totalPages - 1 ? 'var(--im-blue)' : 'var(--im-border)', fontSize: 18, lineHeight: 1, padding: '0 8px' }}>
          ›
        </button>
      </div>

      <style>{`
        @keyframes im-page-out-left { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-40px); } }
        @keyframes im-page-out-right { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(40px); } }
      `}</style>
    </div>
  )
}

// ── Public export ──────────────────────────────────────────────────────────
export default function ReadingPanel({ sentences, currentIdx, highlights, onSelectionChange, onSeek, fontSize = 24, lineHeight = 1.8, viewMode = 'scroll' }) {
  if (viewMode === 'pages') {
    return <PageView sentences={sentences} currentIdx={currentIdx} highlights={highlights} onSelectionChange={onSelectionChange} onSeek={onSeek} fontSize={Math.min(fontSize, 20)} lineHeight={lineHeight} />
  }
  return <ScrollView sentences={sentences} currentIdx={currentIdx} highlights={highlights} onSelectionChange={onSelectionChange} fontSize={fontSize} lineHeight={lineHeight} />
}
