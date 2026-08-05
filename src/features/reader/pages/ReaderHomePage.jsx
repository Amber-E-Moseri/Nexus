import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconPlus } from '../icons'
import BookCover from '../components/BookCover'
import { saveStoredBook, deleteStoredBook } from '../services/library-storage'

export default function ReaderHomePage({ currentBook, currentProgress, library, isAdmin, credits, onOpenBook, onImport, onOpenAdmin, onDeleteBook, onRenameBook }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null) // book to confirm-delete
  const [deleteError, setDeleteError] = useState(null)

  const progress = currentBook
    ? Math.round((currentProgress / Math.max(1, (currentBook.sentences?.length ?? 1) - 1)) * 100)
    : 0

  const filtered = library.filter((b) =>
    !search || b.title.toLowerCase().includes(search.toLowerCase())
  )

  async function handleRename(book) {
    const title = newName.trim()
    if (!title || title === book.title) { setRenameId(null); setNewName(''); return }
    try {
      await saveStoredBook({ ...book, title })
      onRenameBook?.(book.id, title)
      setRenameId(null); setNewName('')
    } catch (err) { console.error('Rename failed:', err) }
  }

  async function handleDelete(book) {
    setDeleteError(null)
    try {
      await deleteStoredBook(book.id)
      onDeleteBook?.(book.id)
      setConfirmDelete(null)
      setMenuOpen(null)
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleteError(err?.message ?? 'Failed to delete book.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', flexShrink: 0, borderBottom: '1px solid var(--im-border)', background: 'var(--im-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif', padding: '4px 0' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Nexus
          </button>
          <span style={{ color: 'var(--im-border)', fontSize: 14 }}>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--im-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><rect x="4" y="3" width="6" height="18" rx="2"/><rect x="14" y="3" width="6" height="18" rx="2"/></svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--im-text)', letterSpacing: '0.1px' }}>immerse</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {credits > 0 && (
            <span style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{credits}h</span>
          )}
          {isAdmin && (
            <button onClick={onOpenAdmin} style={{ minHeight: 32, padding: '0 12px', borderRadius: 6, background: 'var(--im-card)', border: '1px solid var(--im-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--im-text)', fontSize: 12, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
              Admin
            </button>
          )}
          <button onClick={onImport} style={{ minHeight: 32, padding: '0 12px', borderRadius: 6, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
            <IconPlus size={14} color="#fff" /> Import PDF
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>

        {/* Now Reading */}
        {currentBook && (
          <div
            onClick={() => onOpenBook(currentBook)}
            style={{ display: 'flex', gap: 14, padding: 16, background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 12, marginBottom: 24, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(76,42,146,0.10)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <BookCover title={currentBook.title} width={72} height={100} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--im-blue)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>Now Reading</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBook.title}</div>
              {currentBook.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 10 }}>{currentBook.author}</div>}
              <div style={{ height: 4, background: 'var(--im-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), #7B5BB6)', width: `${progress}%`, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--im-text-muted)' }}>{progress}% · {currentBook.estimatedMinutes} min read</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', color: 'var(--im-text-dim)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>
        )}

        {/* Library section */}
        {library.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', color: 'var(--im-text-dim)', gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--im-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--im-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 6 }}>Your library is empty</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 240 }}>Import a PDF to start reading with AI-powered audio narration.</div>
            </div>
            <button onClick={onImport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 8, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
              <IconPlus size={15} color="#fff" /> Import your first book
            </button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--im-text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search library…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--im-border)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-bg)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--im-blue)'; e.target.style.background = 'var(--im-card)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--im-border)'; e.target.style.background = 'var(--im-bg)' }}
              />
            </div>

            {/* Book list */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--im-text-dim)', padding: '40px 0', fontSize: 13 }}>No books match "{search}"</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filtered.map((book) => {
                  const prog = Math.round(((book.progressIndex ?? 0) / Math.max(1, (book.sentences?.length ?? 1) - 1)) * 100)
                  return (
                    <div key={book.id} style={{ display: 'flex', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--im-border-lt)', alignItems: 'center', position: 'relative' }}>
                      <div style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => onOpenBook(book)}>
                        <BookCover title={book.title} width={52} height={74} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpenBook(book)}>
                        {renameId === book.id ? (
                          <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(book)
                              if (e.key === 'Escape') { setRenameId(null); setNewName('') }
                            }}
                            onBlur={() => handleRename(book)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 14, fontWeight: 700, border: '1px solid var(--im-blue)', borderRadius: 4, padding: '4px 6px', fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-card)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                          />
                        ) : (
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                        )}
                        {book.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginTop: 2 }}>{book.author}</div>}
                        <div style={{ height: 3, background: 'var(--im-border)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), #7B5BB6)', width: `${prog}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--im-text-dim)', marginTop: 3 }}>{book.estimatedMinutes} min · {prog}% complete</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === book.id ? null : book.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: 'var(--im-text-dim)', fontSize: 16, lineHeight: 1 }}
                        >
                          ···
                        </button>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--im-text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }} onClick={() => onOpenBook(book)}><path d="M9 18l6-6-6-6"/></svg>
                      </div>
                      {menuOpen === book.id && (
                        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 20, background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 8, marginTop: 4, zIndex: 10, minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                          <button onClick={() => { setRenameId(book.id); setNewName(book.title); setMenuOpen(null) }} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', borderBottom: '1px solid var(--im-border-lt)' }}>
                            Rename
                          </button>
                          <button onClick={() => { setConfirmDelete(book); setMenuOpen(null) }} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#EF4444', fontFamily: 'Inter, sans-serif' }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal — no confirm() which can be blocked on mobile */}
      {confirmDelete && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ background: 'var(--im-card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 8 }}>Delete book?</div>
            <div style={{ fontSize: 13, color: 'var(--im-text-dim)', marginBottom: 20, lineHeight: 1.5 }}>
              "{confirmDelete.title}" will be permanently removed from your library.
            </div>
            {deleteError && (
              <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, padding: '8px 10px', background: '#FEF2F2', borderRadius: 6 }}>{deleteError}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirmDelete(null); setDeleteError(null) }} style={{ flex: 1, padding: '9px 0', background: 'var(--im-border-lt)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: 'var(--im-text)' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ flex: 1, padding: '9px 0', background: '#EF4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: '#fff' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
