import { useState, useMemo } from 'react'
import { Headphones, ChevronRight, CheckCircle } from 'lucide-react'
import ReadingPanel from './ReadingPanel'
import PlayerControls from './PlayerControls'
import MobilePlayer from './MobilePlayer'

const TABS = ['Read', 'Listen', 'Tandem']

export default function ReaderTabs({
  book, sentences, currentIdx, isPlaying, elapsedTime, totalTime, voice, speed,
  highlights, notes, fontSize, lineHeight, credits,
  onPlay, onPause, onSeek, onSkip, onSpeedChange, onVoiceChange,
  onAddHighlight, onAddNote, onRemoveAnnotation, onSelectionChange,
  onEndSession, onOpenSettings, viewMode, onToggleViewMode, showChapters, onShowChapters,
}) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('immerse-tab') || 'Read')
  const isDesktop = window.innerWidth >= 768

  function handleTabChange(tab) {
    setActiveTab(tab)
    localStorage.setItem('immerse-tab', tab)
  }

  const progress = sentences.length > 1 ? currentIdx / (sentences.length - 1) : 0
  const progressPercent = Math.round(progress * 100)


  // Listen tab: audio-focused playback
  function ListenView() {
    const currentChapter = sentences.length > 0 ? Math.floor(currentIdx / 50) + 1 : 1
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '32px 16px', height: '100%' }}>
        <Headphones size={48} color="var(--im-blue)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--im-text)', marginBottom: 4 }}>Now Playing</div>
          <div style={{ fontSize: 14, color: 'var(--im-text-dim)', marginBottom: 8 }}>{book.title}</div>
          <div style={{ fontSize: 12, color: 'var(--im-text-dim)' }}>Chapter {currentChapter}</div>
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

  // Read tab: clean text view with minimal highlighting/notes (Apple Notes style)
  function ReadView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--im-bg)' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: isDesktop ? '40px 120px' : '20px 16px', maxWidth: isDesktop ? 800 : '100%', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--im-text)', marginBottom: 8 }}>{book.title}</div>
            {book.author && <div style={{ fontSize: 14, color: 'var(--im-text-dim)' }}>{book.author}</div>}
          </div>
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
    </div>
  )
}
