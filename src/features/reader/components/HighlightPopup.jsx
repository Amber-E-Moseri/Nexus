import { useEffect, useState } from 'react'
import { IconHighlight, IconNote } from '../icons'

export default function HighlightPopup({ info, onHighlight, onAddNote, onClose, onPlayFrom }) {
  const [mode, setMode] = useState('buttons')
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!info) return null

  const rect = info.rect
  const top = rect.top < 80 ? rect.bottom + 8 : rect.top - (mode === 'note' ? 120 : 46)
  const left = Math.min(Math.max(rect.left, 8), window.innerWidth - 260)

  const popupStyle = {
    position: 'fixed',
    top,
    left,
    zIndex: 300,
    background: 'var(--im-card)',
    border: '1px solid var(--im-border)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '8px 10px',
    animation: 'im-slide-up 0.15s ease-out',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={popupStyle}>
        {mode === 'buttons' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { onHighlight(info); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--im-blue-bg)', border: 'none', borderRadius: 6, color: 'var(--im-blue)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <IconHighlight size={12} color="var(--im-blue)" /> Highlight
            </button>
            <button
              onClick={() => setMode('note')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--im-pink-bg)', border: 'none', borderRadius: 6, color: 'var(--im-pink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <IconNote size={12} color="var(--im-pink)" /> Note
            </button>
            {onPlayFrom && (
              <button
                onClick={() => { onPlayFrom(info.sentenceIdx); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(34,197,94,0.1)', border: 'none', borderRadius: 6, color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >
                ▶ Play here
              </button>
            )}
          </div>
        ) : (
          <div>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              style={{ width: '100%', height: 72, resize: 'none', border: '1px solid var(--im-border)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--im-text)' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && noteText.trim()) { e.preventDefault(); onAddNote(info, noteText); onClose() } }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => { if (noteText.trim()) { onAddNote(info, noteText); onClose() } }}
                style={{ flex: 1, padding: '6px', background: 'var(--im-pink)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >Save</button>
              <button
                onClick={onClose}
                style={{ padding: '6px 10px', background: 'var(--im-border-lt)', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
