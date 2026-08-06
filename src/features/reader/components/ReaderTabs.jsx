import { useState, useMemo, useEffect, useRef } from 'react'
import { Headphones, ChevronRight, CheckCircle } from 'lucide-react'
import ReadingPanel from './ReadingPanel'
import PlayerControls from './PlayerControls'
import MobilePlayer from './MobilePlayer'
import PdfPageView from './PdfPageView'
import { sentenceIdxForPage } from '../services/page-map'

const TABS = ['Read', 'Listen', 'Tandem']

export default function ReaderTabs({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, fontSize, lineHeight, credits,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onSelectionChange,
  onEndSession, onOpenSettings, viewMode, onToggleViewMode, showChapters, onShowChapters,
  pdfBuffer, totalPages, currentPage, sentencePageMap,
}) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('immerse-tab') || 'Read')
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Track the page the PDF view is currently on so position can be synced back
  const pdfPageRef = useRef(currentPage)

  function handleTabChange(tab) {
    setActiveTab(tab)
    localStorage.setItem('immerse-tab', tab)
  }

  // Keyboard shortcuts for reader controls
  useEffect(() => {
    function handleKeydown(e) {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const isShiftKey = e.shiftKey
      const isCtrlCmd = e.ctrlKey || e.metaKey

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          isPlaying ? onPause() : onPlay(currentIdx)
          break
        case 'arrowright':
          if (!isShiftKey && currentIdx < sentences.length - 1) {
            onSeek(currentIdx + 1)
          } else if (isShiftKey) {
            onSkip(15)
          }
          break
        case 'arrowleft':
          if (!isShiftKey && currentIdx > 0) {
            onSeek(Math.max(0, currentIdx - 1))
          } else if (isShiftKey) {
            onSkip(-15)
          }
          break
        case '[':
          onSpeedChange(Math.max(0.5, speed - 0.25))
          break
        case ']':
          onSpeedChange(Math.min(2, speed + 0.25))
          break
        case 'h':
          if (!isCtrlCmd) setShowHelp(true)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [currentIdx, isPlaying, sentences.length, speed, onPlay, onPause, onSeek, onSkip, onSpeedChange])

  const [showHelp, setShowHelp] = useState(false)

  const progress = sentences.length > 1 ? currentIdx / (sentences.length - 1) : 0
  const progressPercent = Math.round(progress * 100)


  // Listen tab: audio-focused playback
  function ListenView() {
    const currentChapter = sentences.length > 0 ? Math.floor(currentIdx / 50) + 1 : 1
    // Calculate total listening time at current speed (0.2 mins per sentence)
    const totalMins = sentences.length * 0.2
    const totalHours = (totalMins / 60 / speed).toFixed(1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '32px 16px', height: '100%' }}>
        <Headphones size={48} color="var(--im-blue)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--im-text)', marginBottom: 4 }}>Now Playing</div>
          <div style={{ fontSize: 14, color: 'var(--im-text-dim)', marginBottom: 8 }}>{book.title}</div>
          <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 12 }}>Chapter {currentChapter}</div>
          <div style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 600, padding: '6px 12px', background: 'var(--im-blue-bg)', borderRadius: 4, display: 'inline-block' }}>
            {totalHours}h @ {speed}x speed
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 350 }}>
          {isDesktop ? (
            <PlayerControls
              isPlaying={isPlaying}
              progress={progress}
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
          ) : (
            <MobilePlayer
              isPlaying={isPlaying}
              progress={progress}
              elapsedTime={elapsedTime}
              voice={voice}
              speed={speed}
              visible={true}
              onPlay={() => onPlay(currentIdx)}
              onPause={onPause}
              onVoiceChange={onVoiceChange}
              onSpeedChange={onSpeedChange}
            />
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--im-text-dim)', textAlign: 'center' }}>
          {elapsedTime} / {totalTime}
        </div>
      </div>
    )
  }

  // Read tab: switches between text rendering modes and PDF canvas based on viewMode
  function ReadView() {
    // PDF page-flip view (viewMode === 'pdf')
    if (viewMode === 'pdf') {
      if (!pdfBuffer) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: 'var(--im-text-dim)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
            <span>PDF view not available — re-import the book as a PDF file.</span>
          </div>
        )
      }
      return (
        <PdfPageView
          pdfBuffer={pdfBuffer}
          totalPages={totalPages ?? 1}
          initialPage={currentPage ?? 1}
          onPageChange={(p) => {
            pdfPageRef.current = p
            // Sync reading position back so audio tabs resume from the right place
            if (sentencePageMap?.length) {
              onSeek(sentenceIdxForPage(sentencePageMap, p))
            }
          }}
        />
      )
    }

    // Text rendering views (scroll / pages / teleprompter)
    function handleSelectionChange(info) {
      if (info?.sentenceIdx != null && info.sentenceIdx >= 0) onSeek(info.sentenceIdx)
      onSelectionChange(info)
    }

    const isFullscreen = viewMode === 'teleprompter'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--im-bg)' }}>
        <div style={{ flex: 1, overflowY: isFullscreen ? 'hidden' : 'auto', padding: isFullscreen ? 0 : (isDesktop ? '40px 120px' : '20px 16px'), maxWidth: isFullscreen ? '100%' : (isDesktop ? 800 : '100%'), margin: '0 auto', width: '100%', display: isFullscreen ? 'flex' : 'block', flexDirection: 'column' }}>
          {!isFullscreen && (
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--im-text)', marginBottom: 8 }}>{book.title}</div>
              {book.author && <div style={{ fontSize: 14, color: 'var(--im-text-dim)' }}>{book.author}</div>}
            </div>
          )}
          <ReadingPanel
            sentences={sentences}
            currentIdx={currentIdx}
            highlights={highlights}
            onSelectionChange={handleSelectionChange}
            onSeek={onSeek}
            fontSize={fontSize}
            lineHeight={lineHeight}
            viewMode={viewMode}
            isPlaying={isPlaying}
          />
        </div>
      </div>
    )
  }

  // Tandem tab: text with real-time highlight sync during playback
  function TandemView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', borderBottom: '1px solid var(--im-border)' }}>
          <ReadingPanel
            sentences={sentences}
            currentIdx={currentIdx}
            highlights={highlights}
            onSelectionChange={onSelectionChange}
            onSeek={onSeek}
            fontSize={fontSize}
            lineHeight={lineHeight}
            viewMode="scroll"
            isPlaying={isPlaying}
          />
        </div>
        <div style={{ padding: '12px 16px', background: 'var(--im-card)', borderTop: '1px solid var(--im-border)' }}>
          {isDesktop ? (
            <PlayerControls
              isPlaying={isPlaying}
              progress={progress}
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
          ) : (
            <MobilePlayer
              isPlaying={isPlaying}
              progress={progress}
              elapsedTime={elapsedTime}
              voice={voice}
              speed={speed}
              visible={true}
              onPlay={() => onPlay(currentIdx)}
              onPause={onPause}
              onVoiceChange={onVoiceChange}
              onSpeedChange={onSpeedChange}
            />
          )}
        </div>
      </div>
    )
  }

  const tabViews = {
    Read: <ReadView />,
    Listen: <ListenView />,
    Tandem: <TandemView />,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 2,
        padding: isDesktop ? '0 16px' : '8px 8px',
        borderBottom: '1px solid var(--im-border)',
        background: 'var(--im-card)',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              padding: isDesktop ? '10px 16px' : '8px 12px',
              fontSize: isDesktop ? 13 : 11,
              fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? 'var(--im-blue)' : 'var(--im-text-dim)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--im-blue)' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}>
        {tabViews[activeTab]}
      </div>

      {/* Keyboard shortcuts help modal */}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowHelp(false)}>
          <div style={{ background: 'var(--im-card)', borderRadius: 12, padding: '24px', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--im-border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--im-text)', marginBottom: 16, fontFamily: 'Inter, sans-serif' }}>Keyboard Shortcuts</h3>
            <div style={{ display: 'grid', gap: 12, fontSize: 12, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>Space</kbd>
                <span>Play / Pause</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>→</kbd>
                <span>Next sentence</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>←</kbd>
                <span>Previous sentence</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>Shift+→</kbd>
                <span>Skip forward 15s</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>Shift+←</kbd>
                <span>Skip back 15s</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>[</kbd>
                <span>Decrease speed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>]</kbd>
                <span>Increase speed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
                <kbd style={{ background: 'var(--im-border)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', textAlign: 'center' }}>H</kbd>
                <span>Show this help</span>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} style={{ width: '100%', marginTop: 20, padding: '10px', background: 'var(--im-blue)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
