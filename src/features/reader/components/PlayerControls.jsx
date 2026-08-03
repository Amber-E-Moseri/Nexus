import { useState } from 'react'
import { IconPlay, IconPause, IconMic, IconBolt, IconChevronDown } from '../icons'
import { VOICE_TONE_LABELS } from '../services/openai-tts'

const SPEEDS = [0.75, 1.0, 1.25, 1.5]
const VOICES = ['Nova', 'Aurora', 'Sage']

export default function PlayerControls({ isPlaying, progress, elapsedTime, totalTime, voice, speed, currentIdx, totalSentences, onPlay, onPause, onSeek, onSkip, onVoiceChange, onSpeedChange }) {
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)

  function handleBarClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(Math.floor(pct * (totalSentences - 1)))
  }

  const eqBase = { width: 3, borderRadius: 2, background: 'var(--im-blue)', display: 'inline-block' }

  return (
    <div className="im-player-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className="im-player-btn"
          style={{ width: 48, height: 48 }}
          onClick={isPlaying ? onPause : () => onPlay()}
        >
          {isPlaying
            ? <IconPause size={20} color="#fff" />
            : <IconPlay size={20} color="#fff" />}
        </button>

        {/* Progress */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--im-text-muted)', fontWeight: 500, minWidth: 32 }}>{elapsedTime}</span>
            <div className="im-progress-bar" onClick={handleBarClick}>
              <div className="im-progress-fill" style={{ width: `${progress * 100}%` }} />
              <div className="im-progress-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--im-text-xdim)', minWidth: 32 }}>{totalTime}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPlaying && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
                <span style={{ ...eqBase, height: 9, animation: 'im-eq-bar1 0.5s ease-in-out infinite' }} />
                <span style={{ ...eqBase, height: 13, animation: 'im-eq-bar2 0.5s ease-in-out infinite 0.1s' }} />
                <span style={{ ...eqBase, height: 6, animation: 'im-eq-bar3 0.5s ease-in-out infinite 0.2s' }} />
              </div>
            )}
            <span className="play-status" style={{ fontSize: 10, color: 'var(--im-blue)', fontWeight: 600, letterSpacing: '0.6px' }}>
              {isPlaying ? 'NOW PLAYING' : 'PAUSED'}
            </span>
          </div>
        </div>

        <button className="im-skip-btn" onClick={() => onSkip(-15)}>−15s</button>
        <button className="im-skip-btn" onClick={() => onSkip(15)}>+15s</button>
      </div>

      {/* Bottom row */}
      <div style={{ borderTop: '1px solid var(--im-border-lt)', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--im-text-dim)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 3 }}>VOICE</div>
          <button className="im-voice-speed-btn" onClick={() => { setVoiceOpen(!voiceOpen); setSpeedOpen(false) }}>
            <IconMic size={11} /> {VOICE_TONE_LABELS[voice]} <IconChevronDown size={10} />
          </button>
          {voiceOpen && (
            <div className="im-pill-row" style={{ marginTop: 6 }}>
              {VOICES.map((v) => (
                <button key={v} className={`im-pill ${voice === v ? 'im-pill--active' : ''}`} onClick={() => { onVoiceChange(v); setVoiceOpen(false) }}>
                  {VOICE_TONE_LABELS[v]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--im-text-dim)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 3 }}>SPEED</div>
          <button className="im-voice-speed-btn" onClick={() => { setSpeedOpen(!speedOpen); setVoiceOpen(false) }}>
            <IconBolt size={11} /> {speed}x <IconChevronDown size={10} />
          </button>
          {speedOpen && (
            <div className="im-pill-row" style={{ marginTop: 6 }}>
              {SPEEDS.map((s) => (
                <button key={s} className={`im-pill ${speed === s ? 'im-pill--active' : ''}`} onClick={() => { onSpeedChange(s); setSpeedOpen(false) }}>
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--im-text-xdim)' }}>
          Track {currentIdx + 1} of {totalSentences}
        </div>
      </div>
    </div>
  )
}
