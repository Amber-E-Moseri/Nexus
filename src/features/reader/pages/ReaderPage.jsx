import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReadingPanel from '../components/ReadingPanel'
import MobilePlayer from '../components/MobilePlayer'
import PlayerControls from '../components/PlayerControls'
import ReaderSidebar from '../components/ReaderSidebar'
import HighlightPopup from '../components/HighlightPopup'
import { IconBack, IconSettings } from '../icons'

export default function ReaderPage({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, selectionInfo, fontSize, lineHeight,
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

  if (isDesktop) {
    return (
      <>
        {/* Desktop header */}
        <div className="im-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="im-logo-mark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="4" y="3" width="6" height="18" rx="2" /><rect x="14" y="3" width="6" height="18" rx="2" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2px', color: 'var(--im-text)' }}>immerse</span>
            <div style={{ width: 1, height: 18, background: 'var(--im-border)', margin: '0 4px' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--im-text)' }}>{book.title}</span>
            {book.author && <><span style={{ color: 'var(--im-text-xdim)' }}>·</span><span style={{ fontSize: 12, color: 'var(--im-text-dim)' }}>{book.author}</span></>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('/dashboard')} style={{ ...hdrBtn, color: 'var(--im-text-dim)' }}>← Nexus</button>
            <div style={{ width: 1, height: 16, background: 'var(--im-border)' }} />
            <button onClick={toggleViewMode} style={hdrBtn}>
              {viewMode === 'scroll' ? '⇕ Scroll' : '⧉ Pages'}
            </button>
            <button onClick={onOpenSettings} style={hdrBtn}><IconSettings size={14} /> Settings</button>
            <button onClick={onBack} style={hdrBtn}><IconBack size={14} /> Library</button>
            <button onClick={onEndSession} style={{ ...hdrBtn, background: 'var(--im-blue)', color: '#fff', borderRadius: 6, padding: '5px 12px' }}>
              End Reading
            </button>
          </div>
        </div>

        {/* Desktop 2-pane layout */}
        <div className="im-reader-layout">
          <div className="im-reader-main">
            <PlayerControls
              isPlaying={isPlaying}
              progress={currentIdx / Math.max(1, sentences.length - 1)}
              elapsedTime={elapsedTime}
              totalTime={totalTime}
              voice={voice}
              speed={speed}
              currentIdx={currentIdx}
              totalSentences={sentences.length}
              onPlay={() => onPlay(currentIdx)}
              onPause={onPause}
              onSeek={onSeek}
              onSkip={onSkip}
              onVoiceChange={onVoiceChange}
              onSpeedChange={onSpeedChange}
            />
            <div className="im-reading-panel">
              <ReadingPanel
                sentences={sentences}
                currentIdx={currentIdx}
                highlights={highlights}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                fontSize={fontSize}
                lineHeight={lineHeight}
                viewMode={viewMode}
              />
            </div>
          </div>
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

  return (
    <>
      {/* Mobile header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--im-border)', background: 'var(--im-card)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'Inter, sans-serif', minWidth: 72 }}>
          <IconBack size={15} /> Library
        </button>
        <span style={{ fontSize: 12, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
          Credits: {(credits / 60).toFixed(1)} hrs
        </span>
        <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4, display: 'flex', alignItems: 'center', fontSize: 16, fontWeight: 700, minWidth: 32, justifyContent: 'flex-end' }}>
          ···
        </button>
      </div>

      {/* Low credit warning */}
      {credits < 60 && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FBBF24', padding: '10px 16px', textAlign: 'center', fontSize: 12, color: '#92400E', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
          Low on credits: {(credits / 60).toFixed(1)} hrs remaining
        </div>
      )}

      {/* Reading area — centered, full flex */}
      <div style={{ flex: 1, overflowY: viewMode === 'scroll' ? 'auto' : 'hidden', overflowX: 'hidden', background: 'var(--im-bg)', display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center', alignItems: 'center', padding: '20px 16px' }} onScroll={handleScroll}>
        <ReadingPanel
          sentences={sentences}
          currentIdx={currentIdx}
          highlights={highlights}
          onSelectionChange={onSelectionChange}
          onSeek={onSeek}
          fontSize={fontSize}
          lineHeight={lineHeight}
          viewMode={viewMode}
        />
      </div>

      {/* Player at bottom */}
      <div style={{ background: 'var(--im-card)', borderTop: '1px solid var(--im-border)', padding: '12px 16px', flexShrink: 0 }}>
        <MobilePlayer
          isPlaying={isPlaying}
          progress={currentIdx / Math.max(1, sentences.length - 1)}
          elapsedTime={elapsedTime}
          voice={voice}
          speed={speed}
          visible={true}
          onPlay={() => onPlay(currentIdx)}
          onPause={onPause}
          onVoiceChange={onVoiceChange}
          onSpeedChange={onSpeedChange}
        />
      </div>

      {selectionInfo && (
        <HighlightPopup
          info={selectionInfo}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onClose={() => onSelectionChange(null)}
        />
      )}

      {/* Chapters drawer (mobile) */}
      {showChapters && (
        <ChaptersDrawer
          sentences={sentences}
          currentIdx={currentIdx}
          onSeek={(idx) => { onSeek(idx); setShowChapters(false) }}
          onClose={() => setShowChapters(false)}
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
