import { useRef, useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize2, Book, AlignLeft, ChevronLeft, Bookmark, Search, BarChart3 } from 'lucide-react'
import ReadingPanel from '../components/ReadingPanel'
import MobilePlayer from '../components/MobilePlayer'
import PlayerControls from '../components/PlayerControls'
import ReaderSidebar from '../components/ReaderSidebar'
import HighlightPopup from '../components/HighlightPopup'
import ReaderTabs from '../components/ReaderTabs'
import { IconBack, IconSettings } from '../icons'
import { detectChapters } from '../services/chapter-detector'
import { buildSentencePageMap, pageForSentence, sentenceIdxForPage } from '../services/page-map'

export default function ReaderPage({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, bookmarks, readingStats, selectionInfo, fontSize, lineHeight, credits, sessionUsedMins = 0,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onAddBookmark, onRemoveBookmark, onJumpToBookmark,
  onSelectionChange, onBack, onOpenSettings, onEndSession,
}) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('immerse-view-mode') || 'scroll')
  const [showChapters, setShowChapters] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem('immerse-sidebar-visible') !== 'false')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showStats, setShowStats] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Chapter + page data derived from book metadata
  const chapters = useMemo(() => {
    const textItems = book?.pdfTextItems ?? book?.textItems
    const pageSizes  = book?.pdfPageSizes  ?? book?.pageSizes
    const outline    = book?.pdfOutline    ?? book?.outline
    return detectChapters(sentences, textItems, pageSizes, outline)
  }, [sentences, book?.pdfTextItems, book?.pdfPageSizes, book?.pdfOutline])

  const sentencePageMap = useMemo(
    () => buildSentencePageMap(sentences, book?.pdfTextItems ?? book?.textItems),
    [sentences, book?.pdfTextItems]
  )

  const totalPages = book?.pdfPageSizes?.length ?? book?.pageSizes?.length ?? 0
  const currentPage = pageForSentence(sentencePageMap, currentIdx)

  const currentChapterIdx = useMemo(() => {
    let ci = 0
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].idx <= currentIdx) ci = i; else break
    }
    return ci
  }, [chapters, currentIdx])

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    return sentences
      .map((s, idx) => ({ text: s, idx }))
      .filter(item => item.text.toLowerCase().includes(query))
  }, [searchQuery, sentences])


  function toggleSidebar() {
    const next = !sidebarVisible
    setSidebarVisible(next)
    localStorage.setItem('immerse-sidebar-visible', String(next))
  }

  const hasPdf = !!(book?.pdfBuffer && totalPages > 0)
  const VIEW_MODES = hasPdf
    ? ['scroll', 'pdf', 'pages', 'teleprompter']
    : ['scroll', 'pages', 'teleprompter']

  function toggleViewMode() {
    const next = VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length]
    setViewMode(next)
    localStorage.setItem('immerse-view-mode', next)
  }

  const viewModeLabel =
    viewMode === 'scroll'       ? { icon: <Maximize2 size={12} />, label: 'Scroll' }
    : viewMode === 'pdf'        ? { icon: <Book size={12} />,      label: 'PDF' }
    : viewMode === 'pages'      ? { icon: <AlignLeft size={12} />, label: 'Pages' }
    :                             { icon: <AlignLeft size={12} />, label: 'Focus' }

  const annotations = [
    ...highlights.map((h) => ({ ...h })),
    ...notes.map((n) => ({ ...n })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  // Check if current sentence is bookmarked
  const isCurrentBookmarked = useMemo(() => {
    return bookmarks?.some(b => b.sentenceIdx === currentIdx) ?? false
  }, [bookmarks, currentIdx])

  // Real-time credit tracking — uses actual audio seconds played, not sentence count estimates
  const creditMetrics = useMemo(() => {
    const creditsUsedHrs = sessionUsedMins / 60
    const creditsRemaining = Math.max(0, parseFloat(credits) - creditsUsedHrs)
    const totalSentences = sentences.length
    return {
      usedHrs: creditsUsedHrs.toFixed(2),
      remainingHrs: creditsRemaining.toFixed(2),
      progress: totalSentences > 0 ? Math.round((currentIdx / totalSentences) * 100) : 0,
    }
  }, [sessionUsedMins, credits, currentIdx, sentences.length])

  function handleHighlight(info) {
    onAddHighlight(info.sentenceIdx, info.text)
    onSelectionChange(null)
  }

  function handleAddNote(info, content) {
    onAddNote(info.sentenceIdx, content, info.text)
    onSelectionChange(null)
  }

  // Desktop & Mobile unified with tabs
  return (
    <>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isDesktop ? '0 20px' : '0 12px',
        borderBottom: '1px solid var(--im-border)',
        background: 'var(--im-card)',
        flexShrink: 0,
        height: 48,
      }}>
        {/* Left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, flexShrink: 0, padding: '4px 0' }}>
            <IconBack size={14} /> {isDesktop ? 'Library' : ''}
          </button>
          {isDesktop && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--im-border)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{book.title}</span>
              {book.author && <span style={{ fontSize: 12, color: 'var(--im-text-dim)', flexShrink: 0 }}>· {book.author}</span>}
            </>
          )}
        </div>

        {/* Center: title on mobile */}
        {!isDesktop && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, textAlign: 'center' }}>{book.title}</span>
        )}

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 4 : 2, flexShrink: 0 }}>
          {/* Credits badge */}
          <span style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif', background: 'var(--im-blue-bg)', borderRadius: 20, padding: '3px 8px', marginRight: 4 }}>
            {creditMetrics.remainingHrs}h
          </span>

          {isDesktop && (
            <>
              <button onClick={toggleViewMode} style={{ ...hdrBtn, gap: 4 }}>
                {viewModeLabel.icon} {viewModeLabel.label}
              </button>
              <button
                onClick={() => isCurrentBookmarked ? onRemoveBookmark?.(bookmarks.find(b => b.sentenceIdx === currentIdx)?.id) : onAddBookmark?.()}
                style={{ ...hdrBtn, color: isCurrentBookmarked ? 'var(--im-blue)' : 'var(--im-text-dim)' }}
                title="Bookmark">
                <Bookmark size={13} fill={isCurrentBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button onClick={() => setShowSearch(!showSearch)} style={{ ...hdrBtn, color: showSearch ? 'var(--im-blue)' : 'var(--im-text-dim)' }} title="Search">
                <Search size={13} />
              </button>
              <button onClick={() => setShowStats(!showStats)} style={{ ...hdrBtn, color: showStats ? 'var(--im-blue)' : 'var(--im-text-dim)' }} title="Stats">
                <BarChart3 size={13} />
              </button>
              <button onClick={onOpenSettings} style={hdrBtn} title="Settings"><IconSettings size={13} /></button>
              <button onClick={toggleSidebar} style={{ ...hdrBtn, color: sidebarVisible ? 'var(--im-blue)' : 'var(--im-text-dim)' }} title={sidebarVisible ? 'Hide panel' : 'Show panel'}>
                <ChevronLeft size={13} style={{ transform: sidebarVisible ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
              </button>
              <div style={{ width: 1, height: 16, background: 'var(--im-border)' }} />
              <button onClick={onEndSession} style={{ ...hdrBtn, background: 'var(--im-blue)', color: '#fff', borderRadius: 6, padding: '5px 14px', fontSize: 12 }}>
                Done
              </button>
            </>
          )}

          {!isDesktop && (
            <>
              {chapters.length > 0 && (
                <button onClick={() => setShowChapters(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: '4px 6px', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                  Ch
                </button>
              )}
              <button
                onClick={() => setShowAnnotations(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: (highlights.length + notes.length) > 0 ? 'var(--im-blue)' : 'var(--im-text-dim)', padding: '4px 6px', fontSize: 16, display: 'flex', alignItems: 'center' }}
                title="Highlights & Notes"
              >
                <Bookmark size={15} fill={(highlights.length + notes.length) > 0 ? 'currentColor' : 'none'} />
              </button>
              <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: '4px 6px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                ···
              </button>
            </>
          )}
        </div>
      </div>

      {/* Low credit warning with detailed breakdown */}
      {parseFloat(creditMetrics.remainingHrs) < 1 && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FBBF24', padding: '10px 16px', fontSize: 12, color: '#92400E', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
          <div style={{ marginBottom: 6 }}>Low on credits: {creditMetrics.remainingHrs} hrs remaining</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, opacity: 0.85 }}>
            <div>Cost per sentence: {creditMetrics.costPerSentence} hrs</div>
            <div>Used this session: {creditMetrics.usedHrs} hrs</div>
          </div>
        </div>
      )}

      {/* Chapter + page navigation bar */}
      {isDesktop && (chapters.length > 0 || totalPages > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--im-border)', background: 'var(--im-sidebar-bg)', flexShrink: 0, height: 36, gap: 16, fontSize: 12, fontFamily: 'Inter, sans-serif' }}>
          {/* Chapter nav */}
          {chapters.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <button
                onClick={() => currentChapterIdx > 0 && onSeek(chapters[currentChapterIdx - 1].idx)}
                disabled={currentChapterIdx === 0}
                style={{ background: 'none', border: 'none', cursor: currentChapterIdx > 0 ? 'pointer' : 'default', color: currentChapterIdx > 0 ? 'var(--im-text)' : 'var(--im-border)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>
                ‹
              </button>
              <span style={{ color: 'var(--im-text-dim)', flexShrink: 0, fontSize: 11 }}>Ch</span>
              <span
                style={{ color: 'var(--im-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, cursor: 'pointer' }}
                title={chapters[currentChapterIdx]?.title}
                onClick={() => onSeek(chapters[currentChapterIdx]?.idx ?? 0)}>
                {currentChapterIdx + 1}. {chapters[currentChapterIdx]?.title ?? ''}
              </span>
              <span style={{ color: 'var(--im-text-xdim)', flexShrink: 0 }}>/ {chapters.length}</span>
              <button
                onClick={() => currentChapterIdx < chapters.length - 1 && onSeek(chapters[currentChapterIdx + 1].idx)}
                disabled={currentChapterIdx >= chapters.length - 1}
                style={{ background: 'none', border: 'none', cursor: currentChapterIdx < chapters.length - 1 ? 'pointer' : 'default', color: currentChapterIdx < chapters.length - 1 ? 'var(--im-text)' : 'var(--im-border)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>
                ›
              </button>
            </div>
          )}

          {/* Page nav */}
          {totalPages > 0 && sentencePageMap.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => { const prevP = Math.max(1, currentPage - 1); onSeek(sentenceIdxForPage(sentencePageMap, prevP)) }}
                disabled={currentPage <= 1}
                style={{ background: 'none', border: 'none', cursor: currentPage > 1 ? 'pointer' : 'default', color: currentPage > 1 ? 'var(--im-text)' : 'var(--im-border)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
                ‹
              </button>
              <span style={{ color: 'var(--im-text-dim)', fontSize: 11, flexShrink: 0 }}>Pg</span>
              <span style={{ color: 'var(--im-text)', fontWeight: 600 }}>{currentPage}</span>
              <span style={{ color: 'var(--im-text-xdim)' }}>/ {totalPages}</span>
              <button
                onClick={() => { const nextP = Math.min(totalPages, currentPage + 1); onSeek(sentenceIdxForPage(sentencePageMap, nextP)) }}
                disabled={currentPage >= totalPages}
                style={{ background: 'none', border: 'none', cursor: currentPage < totalPages ? 'pointer' : 'default', color: currentPage < totalPages ? 'var(--im-text)' : 'var(--im-border)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
                ›
              </button>
              <form
                onSubmit={(e) => { e.preventDefault(); const n = parseInt(e.target.elements.pg.value); if (n >= 1 && n <= totalPages) { onSeek(sentenceIdxForPage(sentencePageMap, n)); e.target.reset() } }}
                style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                <input name="pg" type="number" min={1} max={totalPages} placeholder="Jump…"
                  style={{ width: 60, padding: '2px 5px', border: '1px solid var(--im-border)', borderRadius: 4, background: 'var(--im-bg)', color: 'var(--im-text)', fontSize: 11, fontFamily: 'Inter, sans-serif', outline: 'none', textAlign: 'center' }} />
                <button type="submit" style={{ padding: '2px 7px', background: 'var(--im-border)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif' }}>Go</button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab-based content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ReaderTabs
          book={book}
          sentences={sentences}
          currentIdx={currentIdx}
          isPlaying={isPlaying}
          elapsedTime={elapsedTime}
          totalTime={totalTime}
          voice={voice}
          speed={speed}
          highlights={highlights}
          notes={notes}
          fontSize={fontSize}
          lineHeight={lineHeight}
          credits={credits}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeek}
          onSkip={onSkip}
          onSpeedChange={onSpeedChange}
          onVoiceChange={onVoiceChange}
          onAddHighlight={onAddHighlight}
          onAddNote={onAddNote}
          onRemoveAnnotation={onRemoveAnnotation}
          onSelectionChange={onSelectionChange}
          onEndSession={onEndSession}
          onOpenSettings={onOpenSettings}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          showChapters={showChapters}
          onShowChapters={setShowChapters}
          pdfBuffer={book?.pdfBuffer}
          totalPages={totalPages}
          currentPage={currentPage}
          sentencePageMap={sentencePageMap}
        />

        {isDesktop && sidebarVisible && (
          <ReaderSidebar
            book={book}
            sentences={sentences}
            highlights={highlights}
            notes={notes}
            bookmarks={bookmarks}
            annotations={annotations}
            currentIdx={currentIdx}
            totalSentences={sentences.length}
            onAddHighlight={(idx, text) => onAddHighlight(idx, text)}
            onAddNote={(idx, content) => onAddNote(idx, content)}
            onRemoveAnnotation={onRemoveAnnotation}
            onRemoveBookmark={onRemoveBookmark}
            onSeek={onSeek}
          />
        )}
      </div>

      {!isDesktop && showChapters && (
        <ChaptersDrawer
          sentences={sentences}
          chapters={chapters}
          currentIdx={currentIdx}
          onSeek={onSeek}
          onClose={() => setShowChapters(false)}
        />
      )}

      {!isDesktop && showAnnotations && (
        <AnnotationsDrawer
          highlights={highlights}
          notes={notes}
          sentences={sentences}
          onSeek={(idx) => { onSeek(idx); setShowAnnotations(false) }}
          onRemove={onRemoveAnnotation}
          onClose={() => setShowAnnotations(false)}
        />
      )}

      {selectionInfo && (
        <HighlightPopup
          info={selectionInfo}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onClose={() => onSelectionChange(null)}
          onPlayFrom={(idx) => { onSeek(idx); onPlay(idx) }}
        />
      )}

      {/* Statistics panel */}
      {showStats && readingStats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setShowStats(false)}>
          <div style={{ background: 'var(--im-card)', borderRadius: 12, padding: '24px', maxWidth: 420, border: '1px solid var(--im-border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-text)', marginBottom: 20, fontFamily: 'Inter, sans-serif' }}>Reading Statistics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ background: 'var(--im-blue-bg)', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>Time Spent</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-blue)', fontFamily: 'monospace' }}>{readingStats.elapsedHours}h</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif' }}>{readingStats.elapsedMins}m</div>
              </div>
              <div style={{ background: 'var(--im-blue-bg)', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>Completion</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-blue)', fontFamily: 'monospace' }}>{readingStats.completionPercent}%</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif' }}>{currentIdx} / {sentences.length}</div>
              </div>
              <div style={{ background: 'var(--im-blue-bg)', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>Reading Speed</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-blue)', fontFamily: 'monospace' }}>{readingStats.sentencesPerMin}</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif' }}>sent/min</div>
              </div>
              <div style={{ background: 'var(--im-blue-bg)', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>Est. Time Left</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-blue)', fontFamily: 'monospace' }}>{readingStats.estimatedHoursRemaining}h</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif' }}>{readingStats.remainingSentences} sent</div>
              </div>
            </div>
            <button onClick={() => setShowStats(false)} style={{ width: '100%', padding: '10px', background: 'var(--im-border)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)' }}>Close</button>
          </div>
        </div>
      )}

      {/* Search panel */}
      {showSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setShowSearch(false)}>
          <div style={{ background: 'var(--im-card)', borderRadius: 12, padding: '24px', maxWidth: 500, maxHeight: '70vh', overflowY: 'auto', border: '1px solid var(--im-border)', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-text)', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>Search Book</h3>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search text..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--im-border)', borderRadius: 6, fontSize: 14, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-bg)', outline: 'none' }}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowSearch(false) }}
              />
            </div>
            {searchQuery && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
                  {searchResults.slice(0, 20).map((result) => (
                    <button key={result.idx} onClick={() => { onSeek(result.idx); setShowSearch(false) }}
                      style={{ background: 'var(--im-blue-bg)', border: 'none', borderRadius: 6, padding: '10px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s' }}>
                      <div style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>Sentence {result.idx + 1}</div>
                      <div style={{ fontSize: 12, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.text}</div>
                    </button>
                  ))}
                  {searchResults.length > 20 && (
                    <div style={{ fontSize: 11, color: 'var(--im-text-dim)', textAlign: 'center', padding: '8px' }}>Showing 20 of {searchResults.length} results</div>
                  )}
                </div>
              </div>
            )}
            {searchQuery && searchResults.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--im-text-dim)', textAlign: 'center', padding: '20px' }}>No results found</div>
            )}
            <button onClick={() => setShowSearch(false)} style={{ width: '100%', padding: '10px', background: 'var(--im-border)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)' }}>Close</button>
          </div>
        </div>
      )}
    </>
  )

}

function ChaptersDrawer({ sentences, currentIdx, onSeek, onClose, chapters: propChapters }) {
  const chapters = useMemo(() => {
    if (propChapters?.length > 0) return propChapters
    if (sentences.length > 0) return [{ title: 'Start', idx: 0 }]
    return []
  }, [propChapters, sentences])

  const currentChapterIdx = useMemo(() => {
    let ci = 0
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].idx <= currentIdx) ci = i; else break
    }
    return ci
  }, [chapters, currentIdx])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 150 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--im-card)', borderRadius: '16px 16px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column', animation: 'im-slide-up 0.25s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', borderBottom: '1px solid var(--im-border)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif' }}>Chapters</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--im-text-dim)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {chapters.map((ch, i) => {
            const isActive = i === currentChapterIdx
            const nextIdx = chapters[i + 1]?.idx ?? sentences.length
            const done = currentIdx >= nextIdx
            const inProgress = currentIdx >= ch.idx && currentIdx < nextIdx
            return (
              <button key={ch.idx} onClick={() => onSeek(ch.idx)}
                style={{ width: '100%', textAlign: 'left', padding: '13px 20px', background: isActive ? 'var(--im-blue-bg)' : 'none', border: 'none', borderBottom: '1px solid var(--im-border-lt)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? 'var(--im-blue)' : 'var(--im-text-dim)', minWidth: 24, fontFamily: 'Inter, sans-serif' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--im-blue)' : done ? 'var(--im-text-dim)' : 'var(--im-text)', fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title}</div>
                  {inProgress && (
                    <div style={{ height: 2, background: 'var(--im-border)', borderRadius: 1, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round(((currentIdx - ch.idx) / Math.max(1, nextIdx - ch.idx)) * 100))}%`, background: 'var(--im-blue)' }} />
                    </div>
                  )}
                </div>
                {done && <span style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>✓</span>}
                {isActive && !done && <span style={{ fontSize: 18, color: 'var(--im-blue)' }}>›</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AnnotationsDrawer({ highlights, notes, sentences, onSeek, onRemove, onClose }) {
  const [tab, setTab] = useState('highlights')

  const allAnnotations = [
    ...highlights.map((h) => ({ ...h, kind: 'highlight' })),
    ...notes.map((n) => ({ ...n, kind: 'note' })),
  ].sort((a, b) => (a.sentenceIdx ?? 0) - (b.sentenceIdx ?? 0))

  const shown = tab === 'all' ? allAnnotations : allAnnotations.filter((a) => a.kind === tab.replace('highlights', 'highlight').replace('notes', 'note'))

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 150 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--im-card)', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column', animation: 'im-slide-up 0.25s ease-out' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif' }}>
            Highlights &amp; Notes
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--im-text-dim)', lineHeight: 1 }}>×</button>
        </div>
        {/* Tab strip */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--im-border)', marginTop: 8, flexShrink: 0 }}>
          {[['highlights', `Highlights (${highlights.length})`], ['notes', `Notes (${notes.length})`], ['all', 'All']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--im-blue)' : '2px solid transparent', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: tab === t ? 'var(--im-blue)' : 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', marginBottom: -1 }}>
              {label}
            </button>
          ))}
        </div>
        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {shown.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif' }}>
              {tab === 'highlights' ? 'No highlights yet — select text while reading.' : tab === 'notes' ? 'No notes yet — select text and tap Note.' : 'No annotations yet.'}
            </div>
          )}
          {shown.map((a) => (
            <button key={a.id} onClick={() => onSeek(a.sentenceIdx)}
              style={{ width: '100%', textAlign: 'left', padding: '13px 20px', background: 'none', border: 'none', borderBottom: '1px solid var(--im-border-lt)', cursor: 'pointer', display: 'block' }}>
              {/* Quoted text */}
              <div style={{ fontSize: 13, color: 'var(--im-text)', fontFamily: 'var(--im-font-serif, Georgia, serif)', lineHeight: 1.5, marginBottom: a.content ? 6 : 0, background: a.kind === 'highlight' ? 'rgba(251,240,222,0.85)' : 'transparent', borderRadius: 3, padding: a.kind === 'highlight' ? '1px 3px' : 0 }}>
                {a.text || sentences[a.sentenceIdx] || ''}
              </div>
              {/* Note content */}
              {a.content && (
                <div style={{ fontSize: 12, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', lineHeight: 1.5, background: 'var(--im-sidebar-bg, #F8F5F0)', borderLeft: '2px solid var(--im-pink, #B8710A)', padding: '6px 10px', borderRadius: '0 5px 5px 0' }}>
                  {a.content}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--im-text-xdim, var(--im-text-dim))', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  {a.kind === 'highlight' ? '▐ Highlight' : '✎ Note'} · sentence {(a.sentenceIdx ?? 0) + 1}
                </span>
                {onRemove && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(a.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', fontSize: 16, padding: '0 0 0 8px', lineHeight: 1 }}>×</button>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const hdrBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--im-text-muted)', fontFamily: 'Inter, sans-serif',
  borderRadius: 6, transition: 'all 0.12s',
}
