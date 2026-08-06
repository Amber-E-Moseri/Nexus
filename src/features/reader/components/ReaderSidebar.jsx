import { useState, useMemo } from 'react'
import NoteCard from './NoteCard'
import { IconHighlight, IconNote } from '../icons'
import { detectChapters } from '../services/chapter-detector'

export default function ReaderSidebar({ book, sentences = [], highlights, notes, bookmarks = [], annotations, currentIdx, totalSentences, onAddHighlight, onAddNote, onRemoveAnnotation, onRemoveBookmark, onSeek }) {
  const [noteInput, setNoteInput] = useState('')
  const [tab, setTab] = useState('chapters')
  const progress = totalSentences > 0 ? Math.round((currentIdx / totalSentences) * 100) : 0

  const chapters = useMemo(() => {
    const textItems = book?.pdfTextItems ?? book?.textItems
    const pageSizes = book?.pdfPageSizes ?? book?.pageSizes
    const outline = book?.pdfOutline ?? book?.outline
    return detectChapters(sentences, textItems, pageSizes, outline)
  }, [sentences, book?.pdfTextItems, book?.pdfPageSizes, book?.pdfOutline])

  const currentChapterIdx = useMemo(() => {
    let ci = 0
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].idx <= currentIdx) ci = i
      else break
    }
    return ci
  }, [chapters, currentIdx])

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

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--im-border)', flexShrink: 0 }}>
        {[['chapters', 'Chapters'], ['bookmarks', 'Bookmarks'], ['notes', 'Notes']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', color: tab === t ? 'var(--im-blue)' : 'var(--im-text-dim)', borderBottom: tab === t ? '2px solid var(--im-blue)' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Chapters tab */}
      {tab === 'chapters' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chapters.map((ch, i) => {
            const isActive = i === currentChapterIdx
            const nextIdx = chapters[i + 1]?.idx ?? totalSentences
            const chProgress = currentIdx >= ch.idx
              ? Math.min(100, Math.round(((currentIdx - ch.idx) / Math.max(1, nextIdx - ch.idx)) * 100))
              : 0
            return (
              <button key={ch.idx} onClick={() => onSeek?.(ch.idx)}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: isActive ? 'var(--im-blue-bg)' : 'none', border: 'none', borderBottom: '1px solid var(--im-border-lt)', cursor: 'pointer', display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isActive ? 5 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? 'var(--im-blue)' : 'var(--im-text-dim)', minWidth: 20, fontFamily: 'Inter, sans-serif' }}>{i + 1}</span>
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--im-blue)' : 'var(--im-text)', fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ch.title}</span>
                  {currentIdx >= ch.idx && currentIdx < nextIdx && (
                    <span style={{ fontSize: 9, color: 'var(--im-blue)', fontWeight: 700, fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>{chProgress}%</span>
                  )}
                </div>
                {isActive && (
                  <div style={{ height: 2, background: 'var(--im-border)', borderRadius: 1, marginLeft: 28, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${chProgress}%`, background: 'var(--im-blue)', transition: 'width 0.4s' }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Bookmarks tab */}
      {tab === 'bookmarks' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {bookmarks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--im-text-dim)', textAlign: 'center', marginTop: 24 }}>No bookmarks yet. Click the bookmark icon to save passages.</div>
          )}
          {bookmarks.map((bm, idx) => (
            <button key={bm.id} onClick={() => onSeek?.(bm.sentenceIdx)}
              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--im-border-lt)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--im-blue)', fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>Bookmark {bookmarks.length - idx}</div>
                <div style={{ fontSize: 12, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.text}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onRemoveBookmark?.(bm.id) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>×</button>
            </button>
          ))}
        </div>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {annotations.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--im-text-dim)', textAlign: 'center', marginTop: 24 }}>Select text to highlight or add a note</div>
          )}
          {annotations.map((a) => (
            <NoteCard key={a.id} annotation={a} onRemove={onRemoveAnnotation} />
          ))}
        </div>
      )}

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
