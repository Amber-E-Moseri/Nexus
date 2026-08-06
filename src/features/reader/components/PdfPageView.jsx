import { useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Renders a PDF as a flippable book page using pdfjs-dist canvas rendering.
 * 3D flip: single canvas with two-phase rotate (out → swap content → in), which
 * creates a book-page effect without the mirror-image problem of a two-face approach.
 *
 * Credit note: this view is silent — no TTS runs while browsing pages here.
 * Credit deduction only fires on audio playback (in BooksApp.deductUsage), not
 * on page navigation. Position is only synced back to the sentence-based views
 * when the user switches away from this tab.
 */
export default function PdfPageView({ pdfBuffer, totalPages, initialPage = 1, onPageChange }) {
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(true)
  const [jumpInput, setJumpInput] = useState('')

  const pdfRef = useRef(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const flippingRef = useRef(false)
  const pageRef = useRef(initialPage)
  const touchStartX = useRef(null)

  // Load PDF once on mount
  useEffect(() => {
    if (!pdfBuffer) return
    let active = true
    setLoading(true)
    getDocument({ data: pdfBuffer.slice(0) }).promise
      .then(async (pdf) => {
        if (!active) return
        pdfRef.current = pdf
        await drawToCanvas(initialPage, canvasRef.current)
        if (active) setLoading(false)
      })
      .catch((e) => { console.error('[pdf-view] load error', e); if (active) setLoading(false) })
    return () => {
      active = false
      pdfRef.current?.destroy()
    }
  }, [pdfBuffer])

  // Sync when initialPage changes externally (switching back to this tab)
  useEffect(() => {
    if (!pdfRef.current || loading) return
    if (initialPage !== pageRef.current) {
      drawToCanvas(initialPage, canvasRef.current).then(() => {
        pageRef.current = initialPage
        setPage(initialPage)
      })
    }
  }, [initialPage])

  async function drawToCanvas(pageNum, canvas) {
    if (!pdfRef.current || !canvas || pageNum < 1 || pageNum > totalPages) return
    const containerWidth = containerRef.current?.clientWidth ?? 700
    const pdfPage = await pdfRef.current.getPage(pageNum)
    const baseVp = pdfPage.getViewport({ scale: 1 })
    const scale = (containerWidth * 0.85) / baseVp.width
    const vp = pdfPage.getViewport({ scale })
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise
  }

  async function flip(nextPage) {
    if (flippingRef.current || !pdfRef.current || loading) return
    if (nextPage < 1 || nextPage > totalPages) return

    const dir = nextPage > pageRef.current ? 'forward' : 'back'
    const canvas = canvasRef.current
    if (!canvas) return
    flippingRef.current = true

    const origin = dir === 'forward' ? 'left center' : 'right center'
    const halfOut = dir === 'forward' ? '-90deg' : '90deg'
    const halfIn  = dir === 'forward' ? '90deg'  : '-90deg'

    // Phase 1: rotate current page out to perpendicular (180ms)
    canvas.style.transition = 'transform 0.18s linear'
    canvas.style.transformOrigin = origin
    canvas.style.transform = `rotateY(${halfOut})`

    // While rotating, render the destination page off-screen
    const offscreen = document.createElement('canvas')
    let renderDone = false
    drawToCanvas(nextPage, offscreen).then(() => { renderDone = true }).catch(() => { renderDone = true })

    // Wait for phase 1 + ensure render finished (extends the perpendicular pause if slow)
    await delay(185)
    while (!renderDone) await delay(30)

    // Swap canvas content while perpendicular (invisible to viewer)
    if (offscreen.width) {
      canvas.width = offscreen.width
      canvas.height = offscreen.height
      canvas.getContext('2d').drawImage(offscreen, 0, 0)
    }

    // Phase 2: start from opposite perpendicular, animate to flat (incoming page)
    canvas.style.transition = 'none'
    canvas.style.transformOrigin = origin
    canvas.style.transform = `rotateY(${halfIn})`
    canvas.getBoundingClientRect() // force layout so the next transition starts from here
    canvas.style.transition = 'transform 0.18s linear'
    canvas.style.transform = 'rotateY(0deg)'

    await delay(190)
    canvas.style.transition = ''
    canvas.style.transform = ''

    pageRef.current = nextPage
    flippingRef.current = false
    setPage(nextPage)
    onPageChange?.(nextPage)
  }

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 50) return
    flip(dx < 0 ? pageRef.current + 1 : pageRef.current - 1)
  }

  function handleJump(e) {
    e.preventDefault()
    const n = parseInt(jumpInput)
    if (n >= 1 && n <= totalPages) { flip(n); setJumpInput('') }
  }

  if (!pdfBuffer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, background: '#1a1a1a' }}>
        <span style={{ color: '#888', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>PDF not available for this book.</span>
        <span style={{ color: '#555', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Re-import the book to enable the page view.</span>
      </div>
    )
  }

  return (
    <div ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1a1a', overflow: 'hidden' }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Page canvas area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '20px 60px', position: 'relative', perspective: '1200px' }}>
        {/* Left tap zone */}
        <div onClick={() => flip(pageRef.current - 1)}
          style={{ position: 'absolute', left: 0, top: 0, width: '15%', height: '100%', zIndex: 2, cursor: page > 1 ? 'w-resize' : 'default' }} />
        {/* Right tap zone */}
        <div onClick={() => flip(pageRef.current + 1)}
          style={{ position: 'absolute', right: 0, top: 0, width: '15%', height: '100%', zIndex: 2, cursor: page < totalPages ? 'e-resize' : 'default' }} />

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #333', borderTopColor: '#888', borderRadius: '50%', animation: 'pdfSpin 0.8s linear infinite' }} />
            <span style={{ color: '#555', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Rendering page…</span>
          </div>
        ) : (
          <canvas ref={canvasRef}
            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 180px)', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', display: 'block' }} />
        )}
      </div>

      {/* Bottom navigation bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '10px 20px', background: '#111', borderTop: '1px solid #333', flexShrink: 0 }}>
        <button onClick={() => flip(pageRef.current - 1)} disabled={page <= 1}
          style={{ background: 'none', border: 'none', color: page > 1 ? '#ccc' : '#444', fontSize: 22, cursor: page > 1 ? 'pointer' : 'default', lineHeight: 1, padding: '0 4px' }}>
          ‹
        </button>
        <span style={{ color: '#888', fontSize: 12, fontFamily: 'Inter, sans-serif', minWidth: 100, textAlign: 'center', fontWeight: 600 }}>
          Page {page} of {totalPages}
        </span>
        <form onSubmit={handleJump} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            placeholder="Go to…"
            type="number" min={1} max={totalPages}
            style={{ width: 66, padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#ccc', fontSize: 11, fontFamily: 'Inter, sans-serif', textAlign: 'center', outline: 'none' }}
          />
          <button type="submit"
            style={{ background: '#2a2a2a', border: '1px solid #555', borderRadius: 4, color: '#ccc', fontSize: 11, padding: '4px 8px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Go
          </button>
        </form>
        <button onClick={() => flip(pageRef.current + 1)} disabled={page >= totalPages}
          style={{ background: 'none', border: 'none', color: page < totalPages ? '#ccc' : '#444', fontSize: 22, cursor: page < totalPages ? 'pointer' : 'default', lineHeight: 1, padding: '0 4px' }}>
          ›
        </button>
      </div>

      <style>{`@keyframes pdfSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
