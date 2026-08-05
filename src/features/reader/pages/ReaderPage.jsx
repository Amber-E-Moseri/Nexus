import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize2, Book, ChevronLeft, Bookmark, Search } from 'lucide-react'
import ReadingPanel from '../components/ReadingPanel'
import MobilePlayer from '../components/MobilePlayer'
import PlayerControls from '../components/PlayerControls'
import ReaderSidebar from '../components/ReaderSidebar'
import HighlightPopup from '../components/HighlightPopup'
import ReaderTabs from '../components/ReaderTabs'
import { IconBack, IconSettings } from '../icons'

export default function ReaderPage({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, bookmarks, selectionInfo, fontSize, lineHeight, credits,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onAddBookmark, onRemoveBookmark, onJumpToBookmark,
  onSelectionChange, onBack, onOpenSettings, onEndSession,
}) {
  const navigate = useNavigate()
  const [playerVisible, setPlayerVisible] = useState(true)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('immerse-view-mode') || 'scroll')
  const [showChapters, setShowChapters] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem('immerse-sidebar-visible') !== 'false')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const lastScrollY = useRef(0)
  const isDesktop = window.innerWidth >= 768

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

  function toggleViewMode() {
    const next = viewMode === 'scroll' ? 'pages' : 'scroll'
    setViewMode(next)
    localStorage.setItem('immerse-view-mode', next)
  }

  const annotations = [
    ...highlights.map((h) => ({ ...h })),
    ...notes.map((n) => ({ ...n })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  // Check if current sentence is bookmarked
  const isCurrentBookmarked = useMemo(() => {
    return bookmarks?.some(b => b.sentenceIdx === currentIdx) ?? false
  }, [bookmarks, currentIdx])

  // Real-time credit tracking (0.2 mins per sentence = 0.0033 hrs per sentence)
  const creditMetrics = useMemo(() => {
    const MINS_PER_SENTENCE = 0.2
    const creditsUsedMins = currentIdx * MINS_PER_SENTENCE
    const creditsUsedHrs = creditsUsedMins / 60
    const creditsRemaining = Math.max(0, parseFloat(credits) - creditsUsedHrs)
    const totalSentences = sentences.length
    const estimatedTotalHrs = (totalSentences * MINS_PER_SENTENCE) / 60
    const costPerSentence = (MINS_PER_SENTENCE / 60).toFixed(4)
    return {
      usedHrs: creditsUsedHrs.toFixed(2),
      remainingHrs: creditsRemaining.toFixed(2),
      totalHrs: estimatedTotalHrs.toFixed(2),
      costPerSentence,
      progress: totalSentences > 0 ? Math.round((currentIdx / totalSentences) * 100) : 0,
    }
  }, [currentIdx, credits, sentences.length])

  function handleScroll(e) {
    const y = e.currentTarget.scrollTop
    setPlayerVisible(y <= lastScrollY.current || y < 50)
    lastScrollY.current = y
  }

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
        padding: isDesktop ? '0 20px' : '12px 16px',
        borderBottom: '1px solid var(--im-border)',
        background: 'var(--im-card)',
        flexShrink: 0,
        height: isDesktop ? 56 : 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 10 : 0 }}>
          <button onClick={onBack} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--im-text)',
            fontSize: isDesktop ? 14 : 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontFamily: 'Inter, sans-serif',
            minWidth: isDesktop ? 'auto' : 72,
          }}>
            <IconBack size={15} /> {isDesktop ? '' : 'Library'}
          </button>
          {isDesktop && (
            <>
              <div className="im-logo-mark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <rect x="4" y="3" width="6" height="18" rx="2" /><rect x="14" y="3" width="6" height="18" rx="2" />
                </svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2px', color: 'var(--im-text)' }}>immerse</span>
              <div style={{ width: 1, height: 18, background: 'var(--im-border)', margin: '0 4px' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--im-text)' }}>{book.title}</span>
              {book.author && <><span style={{ color: 'var(--im-text-xdim)' }}>·</span><span style={{ fontSize: 12, color: 'var(--im-text-dim)' }}>{book.author}</span></>}
            </>
          )}
        </div>

        <div style={{ fontSize: isDesktop ? 'auto' : 12, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: isDesktop ? 12 : 6, background: isDesktop ? 'none' : 'var(--im-blue-bg)', border: isDesktop ? 'none' : '1px solid var(--im-blue-bg-2)', borderRadius: isDesktop ? 0 : 20, padding: isDesktop ? 0 : '3px 10px' }}>
          <span>{creditMetrics.remainingHrs} hrs</span>
          {isDesktop && (
            <span style={{ fontSize: 11, color: 'var(--im-text-dim)', fontWeight: 400 }}>
              ({creditMetrics.usedHrs} used • {creditMetrics.progress}%)
            </span>
          )}
        </div>

        {isDesktop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('/dashboard')} style={{ ...hdrBtn, color: 'var(--im-text-dim)' }}>← Nexus</button>
            <div style={{ width: 1, height: 16, background: 'var(--im-border)' }} />
            <button onClick={toggleViewMode} style={{ ...hdrBtn, display: 'flex', alignItems: 'center', gap: 5 }}>
              {viewMode === 'scroll' ? (
                <>
                  <Maximize2 size={12} /> Scroll
                </>
              ) : (
                <>
                  <Book size={12} /> Pages
                </>
              )}
            </button>
            <button onClick={toggleSidebar} style={{ ...hdrBtn, display: 'flex', alignItems: 'center', gap: 5, color: sidebarVisible ? 'var(--im-text)' : 'var(--im-text-dim)' }}>
              <ChevronLeft size={12} /> {sidebarVisible ? 'Hide' : 'Show'}
            </button>
            <button onClick={() => isCurrentBookmarked ? onRemoveBookmark?.(bookmarks.find(b => b.sentenceIdx === currentIdx)?.id) : onAddBookmark?.()}
              style={{ ...hdrBtn, display: 'flex', alignItems: 'center', gap: 5, color: isCurrentBookmarked ? 'var(--im-blue)' : 'var(--im-text-dim)' }}>
              <Bookmark size={12} fill={isCurrentBookmarked ? 'currentColor' : 'none'} /> Bookmark
            </button>
            <button onClick={() => setShowSearch(!showSearch)} style={{ ...hdrBtn, display: 'flex', alignItems: 'center', gap: 5, color: showSearch ? 'var(--im-blue)' : 'var(--im-text-dim)' }}>
              <Search size={12} /> Search
            </button>
            <button onClick={onOpenSettings} style={hdrBtn}><IconSettings size={14} /> Settings</button>
            <button onClick={onEndSession} style={{ ...hdrBtn, background: 'var(--im-blue)', color: '#fff', borderRadius: 6, padding: '5px 12px' }}>
              End Reading
            </button>
          </div>
        )}

        {!isDesktop && (
          <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4, display: 'flex', alignItems: 'center', fontSize: 16, fontWeight: 700, minWidth: 32, justifyContent: 'flex-end' }}>
            ···
          </button>
        )}
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

      {selectionInfo && (
        <HighlightPopup
          info={selectionInfo}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onClose={() => onSelectionChange(null)}
        />
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

function isChapterHeading(s) {
  return /^(chapter|part|prologue|epilogue|introduction|preface|afterword)\b/i.test(s.trim()) ||
    /^[A-Z\s\d]{4,40}$/.test(s.trim())
}

function ChaptersDrawer({ sentences, currentIdx, onSeek, onClose }) {
  const chapters = useMemo(() => {
    const list = []
    sentences.forEach((s, idx) => {
      if (isChapterHeading(s) && s.trim().length < 50) list.push({ title: s.trim(), idx })
    })
    if (list.length === 0 && sentences.length > 0) list.push({ title: 'Start', idx: 0 })
    return list
  }, [sentences])

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

const hdrBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--im-text-muted)', fontFamily: 'Inter, sans-serif',
  borderRadius: 6, transition: 'all 0.12s',
}
