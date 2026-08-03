import { useRef, useState } from 'react'
import ReadingPanel from '../components/ReadingPanel'
import MobilePlayer from '../components/MobilePlayer'
import PlayerControls from '../components/PlayerControls'
import ReaderSidebar from '../components/ReaderSidebar'
import HighlightPopup from '../components/HighlightPopup'
import { IconBack, IconSettings } from '../icons'

export default function ReaderPage({
  book, credits, sentences, currentIdx, isPlaying, voice, speed,
  highlights, notes, selectionInfo, fontSize, lineHeight,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onSelectionChange,
  onBack, onBuyCredits, onOpenSettings, onEndSession,
}) {
  const [playerVisible, setPlayerVisible] = useState(true)
  const lastScrollY = useRef(0)
  const isDesktop = window.innerWidth >= 768

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
            <span style={{ fontSize: 11, padding: '4px 10px', background: 'var(--im-border-lt)', borderRadius: 20, color: 'var(--im-text-dim)', fontWeight: 600 }}>
              Credits: {credits} hrs
            </span>
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
              elapsedTime={`${Math.floor(currentIdx / 2)}:${String((currentIdx * 30) % 60).padStart(2, '0')}`}
              totalTime={`${Math.floor(sentences.length / 2)}:${String((sentences.length * 30) % 60).padStart(2, '0')}`}
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
                fontSize={fontSize}
                lineHeight={lineHeight}
              />
            </div>
          </div>
          <ReaderSidebar
            book={book}
            highlights={highlights}
            notes={notes}
            annotations={annotations}
            currentIdx={currentIdx}
            totalSentences={sentences.length}
            onAddHighlight={(idx, text) => onAddHighlight(idx, text)}
            onAddNote={(idx, content) => onAddNote(idx, content)}
            onRemoveAnnotation={onRemoveAnnotation}
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
      <div className="im-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'Inter, sans-serif', minWidth: 72 }}>
          <IconBack size={15} /> Library
        </button>
        <span style={{ fontSize: 12, padding: '4px 12px', background: '#F3F4F6', borderRadius: 20, color: 'var(--im-text-muted)', fontWeight: 600, letterSpacing: '0.2px' }}>
          Credits: <span style={{ color: 'var(--im-blue)' }}>{credits} hrs</span>
        </span>
        <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', padding: 4, display: 'flex', alignItems: 'center', fontSize: 18, fontWeight: 700, minWidth: 72, justifyContent: 'flex-end' }}>
          ···
        </button>
      </div>

      {/* Reading area */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#FAFAFA' }} onScroll={handleScroll}>
        <ReadingPanel
          sentences={sentences}
          currentIdx={currentIdx}
          highlights={highlights}
          onSelectionChange={onSelectionChange}
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
      </div>

      <MobilePlayer
        isPlaying={isPlaying}
        progress={currentIdx / Math.max(1, sentences.length - 1)}
        elapsedTime={`${Math.floor(currentIdx / 2)}:${String((currentIdx * 30) % 60).padStart(2, '0')}`}
        voice={voice}
        speed={speed}
        visible={playerVisible}
        onPlay={() => onPlay(currentIdx)}
        onPause={onPause}
        onVoiceChange={onVoiceChange}
        onSpeedChange={onSpeedChange}
      />

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

const hdrBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--im-text-muted)', fontFamily: 'Inter, sans-serif',
  borderRadius: 6, transition: 'all 0.12s',
}
