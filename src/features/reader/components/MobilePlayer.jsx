import { useState } from 'react'
import { IconPlay, IconPause, IconMic, IconBolt, IconChevronDown } from '../icons'
import { VOICE_TONE_LABELS } from '../services/openai-tts'

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
      padding: '10px 16px 14px',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.2s',
      flexShrink: 0,
    }}>
      {/* Row 1: play + progress + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          className="im-player-btn"
          style={{ width: 36, height: 36 }}
          onClick={isPlaying ? onPause : () => onPlay()}
        >
          {isPlaying ? <IconPause size={16} color="#fff" /> : <IconPlay size={16} color="#fff" />}
        </button>
        <div className="im-progress-bar" style={{ flex: 1, height: 3 }}>
          <div className="im-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--im-text-dim)', minWidth: 35, textAlign: 'right' }}>{elapsedTime}</span>
      </div>

      {/* Row 2: voice + speed */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="im-voice-speed-btn"
          style={{ flex: 1, justifyContent: 'center', fontSize: 10 }}
          onClick={() => { setVoiceOpen(!voiceOpen); setSpeedOpen(false) }}
        >
          <IconMic size={10} /> {VOICE_TONE_LABELS[voice]} <IconChevronDown size={9} />
        </button>
        <button
          className="im-voice-speed-btn"
          style={{ flex: 1, justifyContent: 'center', fontSize: 10 }}
          onClick={() => { setSpeedOpen(!speedOpen); setVoiceOpen(false) }}
        >
          <IconBolt size={10} /> {speed}× <IconChevronDown size={9} />
        </button>
      </div>

      {voiceOpen && (
        <div className="im-pill-row" style={{ marginTop: 8 }}>
          {VOICES.map((v) => (
            <button key={v} className={`im-pill ${voice === v ? 'im-pill--active' : ''}`} onClick={() => { onVoiceChange(v); setVoiceOpen(false) }}>
              {VOICE_TONE_LABELS[v]}
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
