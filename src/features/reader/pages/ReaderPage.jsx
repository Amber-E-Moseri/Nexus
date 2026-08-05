import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReadingPanel from '../components/ReadingPanel'
import MobilePlayer from '../components/MobilePlayer'
import PlayerControls from '../components/PlayerControls'
import ReaderSidebar from '../components/ReaderSidebar'
import HighlightPopup from '../components/HighlightPopup'
import ReaderTabs from '../components/ReaderTabs'
import { IconBack, IconSettings } from '../icons'

export default function ReaderPage({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, selectionInfo, fontSize, lineHeight, credits,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onSelectionChange,
  onBack, onOpenSettings, onEndSession,
}) {
  const navigate = useNavigate()
  const [playerVisible, setPlayerVisible] = useState(true)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('immerse-view-mode') || 'scroll')
  const [showChapters, setShowChapters] = useState(false)
  const lastScrollY = useRef(0)
  const isDesktop = window.innerWidth >= 768

  function toggleViewMode() {
    const next = viewMode === 'scroll' ? 'pages' : 'scroll'
    setViewMode(next)
    localStorage.setItem('immerse-view-mode', next)
  }

  const annotations = [
    ...highlights.map((h) => ({ ...h })),
    ...notes.map((n) => ({ ...n })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

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

        <span style={{ fontSize: isDesktop ? 'auto' : 12, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif', background: isDesktop ? 'none' : 'var(--im-blue-bg)', border: isDesktop ? 'none' : '1px solid var(--im-blue-bg-2)', borderRadius: isDesktop ? 0 : 20, padding: isDesktop ? 0 : '3px 10px' }}>
          Credits: {credits} hrs
        </span>

        {isDesktop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('/dashboard')} style={{ ...hdrBtn, color: 'var(--im-text-dim)' }}>← Nexus</button>
            <div style={{ width: 1, height: 16, background: 'var(--im-border)' }} />
            <button onClick={toggleViewMode} style={hdrBtn}>
              {viewMode === 'scroll' ? '⇕ Scroll' : '⧉ Pages'}
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

      {/* Low credit warning */}
      {parseFloat(credits) < 1 && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FBBF24', padding: '10px 16px', textAlign: 'center', fontSize: 12, color: '#92400E', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
          Low on credits: {credits} hrs remaining
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

        {isDesktop && (
          <ReaderSidebar
            book={book}
            sentences={sentences}
            highlights={highlights}
            notes={notes}
            annotations={annotations}
            currentIdx={currentIdx}
            totalSentences={sentences.length}
            onAddHighlight={(idx, text) => onAddHighlight(idx, text)}
            onAddNote={(idx, content) => onAddNote(idx, content)}
            onRemoveAnnotation={onRemoveAnnotation}
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
