import { useState } from 'react'
import { IconPlay, IconPause, IconMic, IconBolt, IconChevronDown } from '../icons'

const SPEEDS = [0.75, 1.0, 1.25, 1.5]
const VOICES = ['Nova', 'Aurora', 'Sage']

export default function MobilePlayer({ isPlaying, progress, elapsedTime, voice, speed, visible, onPlay, onPause, onVoiceChange, onSpeedChange }) {
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)

  return (
    <div style={{
      position: 'sticky',
      bottom: 0,
      background: 'var(--im-card)',
      borderTop: '1px solid var(--im-border)',
      padding: '14px 20px 22px',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.2s',
      flexShrink: 0,
    }}>
      {/* Row 1: play + progress + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <button
          className="im-player-btn"
          style={{ width: 46, height: 46, flexShrink: 0 }}
          onClick={isPlaying ? onPause : () => onPlay()}
        >
          {isPlaying ? <IconPause size={20} color="#fff" /> : <IconPlay size={20} color="#fff" />}
        </button>
        <div className="im-progress-bar" style={{ flex: 1, height: 3 }}>
          <div className="im-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--im-text-dim)', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{elapsedTime}</span>
      </div>

      {/* Row 2: voice + speed (compact, left-aligned) */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="im-voice-speed-btn"
          onClick={() => { setVoiceOpen(!voiceOpen); setSpeedOpen(false) }}
        >
          <IconMic size={11} /> {voice} <IconChevronDown size={10} />
        </button>
        <button
          className="im-voice-speed-btn"
          onClick={() => { setSpeedOpen(!speedOpen); setVoiceOpen(false) }}
        >
          <IconBolt size={11} /> {speed}× <IconChevronDown size={10} />
        </button>
      </div>

      {voiceOpen && (
        <div className="im-pill-row" style={{ marginTop: 8 }}>
          {VOICES.map((v) => (
            <button key={v} className={`im-pill ${voice === v ? 'im-pill--active' : ''}`} onClick={() => { onVoiceChange(v); setVoiceOpen(false) }}>
              {v}
            </button>
          ))}
        </div>
      )}
      {speedOpen && (
        <div className="im-pill-row" style={{ marginTop: 8 }}>
          {SPEEDS.map((s) => (
            <button key={s} className={`im-pill ${speed === s ? 'im-pill--active' : ''}`} onClick={() => { onSpeedChange(s); setSpeedOpen(false) }}>
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
