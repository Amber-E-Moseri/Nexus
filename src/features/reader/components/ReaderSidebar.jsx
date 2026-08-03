import { useState } from 'react'
import NoteCard from './NoteCard'
import { IconHighlight, IconNote } from '../icons'

export default function ReaderSidebar({ book, highlights, notes, annotations, currentIdx, totalSentences, onAddHighlight, onAddNote, onRemoveAnnotation }) {
  const [noteInput, setNoteInput] = useState('')
  const progress = totalSentences > 0 ? Math.round((currentIdx / totalSentences) * 100) : 0

  function handleHighlight() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text) onAddHighlight(currentIdx, text)
    sel.removeAllRanges()
  }

  function handleNote() {
    if (!noteInput.trim()) return
    onAddNote(currentIdx, noteInput.trim())
    setNoteInput('')
  }

  return (
    <div className="im-reader-sidebar">
      {/* Book info */}
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--im-border)', flexShrink: 0, background: 'var(--im-card)' }}>
        <div style={{ width: '100%', height: 108, borderRadius: 8, border: '1px solid var(--im-border)', overflow: 'hidden', position: 'relative', marginBottom: '1rem', background: 'var(--im-border-lt)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, #F9FAFB 0px, #F9FAFB 8px, #F3F4F6 8px, #F3F4F6 16px)' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--im-text-dim)' }}>book cover</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 2 }}>{book?.title}</div>
        {book?.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 8 }}>{book.author}</div>}
        <div style={{ height: 3, background: 'var(--im-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), var(--im-blue-lt))', width: `${progress}%`, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: 'var(--im-blue)', fontWeight: 600 }}>Track {currentIdx + 1} of {totalSentences}</span>
          <span style={{ color: 'var(--im-text-dim)' }}>{progress}%</span>
        </div>
      </div>

      {/* Annotations list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--im-blue)', textTransform: 'uppercase' }}>Highlights & Notes</span>
          <span style={{ fontSize: 10, color: 'var(--im-text-dim)', background: 'var(--im-border)', borderRadius: 10, padding: '1px 7px' }}>{annotations.length}</span>
        </div>
        {annotations.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--im-text-dim)', textAlign: 'center', marginTop: 24 }}>Select text to highlight or add a note</div>
        )}
        {annotations.map((a) => (
          <NoteCard key={a.id} annotation={a} onRemove={onRemoveAnnotation} />
        ))}
      </div>

      {/* Note input */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--im-border)', background: 'var(--im-card)', flexShrink: 0 }}>
        <input
          className="im-note-input"
          style={{ width: '100%', background: 'var(--im-sidebar-bg)', border: '1px solid var(--im-border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', outline: 'none', marginBottom: 6 }}
          placeholder="Quick note..."
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleNote() }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--im-blue)' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--im-border)' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleHighlight}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 0', background: 'var(--im-blue-bg)', border: 'none', borderRadius: 6, color: 'var(--im-blue)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            <IconHighlight size={12} color="var(--im-blue)" /> Highlight
          </button>
          <button
            onClick={handleNote}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 0', background: 'var(--im-pink-bg)', border: 'none', borderRadius: 6, color: 'var(--im-pink)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            <IconNote size={12} color="var(--im-pink)" /> Note
          </button>
        </div>
      </div>
    </div>
  )
}
