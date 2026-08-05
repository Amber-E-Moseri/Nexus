import { useState } from 'react'
import { IconHome, IconLibrary, IconDocument, IconSearch, IconPlus } from '../icons'
import BookCover from '../components/BookCover'
import { saveStoredBook, deleteStoredBook } from '../services/library-storage'

export default function ReaderLibraryPage({ library, onOpenBook, onGoHome, onImport, onDeleteBook, onRenameBook }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [menuOpen, setMenuOpen] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [newName, setNewName] = useState('')

  const filtered = library.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase()) &&
    (tab === 'all' || b.source === 'pdf')
  )

  async function handleRename(book) {
    const newTitle = newName.trim()
    if (!newTitle || newTitle === book.title) {
      setRenameId(null)
      setNewName('')
      return
    }
    try {
      await saveStoredBook({ ...book, title: newTitle })
      onRenameBook?.(book.id, newTitle)
      setRenameId(null)
      setNewName('')
    } catch (err) {
      console.error('Rename failed:', err)
    }
  }

  async function handleDelete(book) {
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return
    try {
      await deleteStoredBook(book.id)
      onDeleteBook?.(book.id)
      setMenuOpen(null)
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete book. Please try again.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 12px', flexShrink: 0, borderBottom: '1px solid var(--im-border)', background: 'var(--im-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onGoHome} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-text-dim)', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif', padding: '4px 0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Home
            </button>
            <span style={{ color: 'var(--im-border)', fontSize: 14 }}>·</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)' }}>Library</span>
          </div>
          <button
            onClick={onImport}
            title="Import PDF"
            style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IconPlus size={15} color="#fff" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--im-border)', marginBottom: 12 }}>
          {[['all', 'All Books', <IconLibrary size={13} />], ['pdfs', 'PDFs', <IconDocument size={13} />]].map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: tab === key ? 'var(--im-blue)' : 'var(--im-text-dim)', borderBottom: tab === key ? '2px solid var(--im-blue)' : '2px solid transparent', marginBottom: -1, transition: 'color 0.15s' }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <IconSearch size={14} color="var(--im-text-dim)" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--im-border)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', outline: 'none', background: 'var(--im-bg)' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--im-blue)'; e.target.style.background = 'var(--im-card)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--im-border)'; e.target.style.background = 'var(--im-bg)' }}
          />
        </div>
      </div>

      {/* Book list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 20px', color: 'var(--im-text-dim)', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--im-border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--im-text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            {search ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', marginBottom: 4 }}>No results</div>
                <div style={{ fontSize: 13 }}>No books match "{search}"</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', marginBottom: 4 }}>Library is empty</div>
                <div style={{ fontSize: 13 }}>Import a PDF to get started</div>
              </div>
            )}
            {!search && (
              <button
                onClick={onImport}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif', marginTop: 4 }}
              >
                <IconPlus size={14} color="#fff" /> Import PDF
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: '0 20px 12px' }}>
            {filtered.map((book) => {
              const prog = Math.round(((book.progressIndex ?? 0) / Math.max(1, (book.sentences?.length ?? 1) - 1)) * 100)
              return (
                <div
                  key={book.id}
                  style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--im-border-lt)', alignItems: 'center', position: 'relative' }}
                  onMouseEnter={(e) => { if (!renameId) e.currentTarget.style.marginLeft = '2px' }}
                  onMouseLeave={(e) => { if (!renameId) e.currentTarget.style.marginLeft = '0' }}
                >
                  <BookCover title={book.title} width={52} height={74} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, cursor: 'pointer' }} onClick={() => onOpenBook(book)}>
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
                        style={{ fontSize: 14, fontWeight: 700, border: '1px solid var(--im-blue)', borderRadius: 4, padding: '4px 6px', fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-card)', outline: 'none' }}
                      />
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                    )}
                    {book.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)' }}>{book.author}</div>}
                    <div style={{ height: 3, background: 'var(--im-border)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), #7B5BB6)', width: `${prog}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--im-text-dim)' }}>{book.estimatedMinutes} min · {prog}% complete</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === book.id ? null : book.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: 'var(--im-text-dim)', fontSize: 16, lineHeight: 1 }}
                    >
                      ···
                    </button>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--im-text-dim)' }}><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                  {menuOpen === book.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ position: 'absolute', top: '100%', right: 20, background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 8, marginTop: 4, zIndex: 10, minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    >
                      <button
                        onClick={() => { setRenameId(book.id); setNewName(book.title); setMenuOpen(null) }}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif', borderBottom: '1px solid var(--im-border-lt)' }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(book)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#EF4444', fontFamily: 'Inter, sans-serif' }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="im-bottom-nav">
        <button className="im-bottom-nav-tab" onClick={onGoHome}>
          <IconHome size={20} /> Home
        </button>
        <button className="im-bottom-nav-tab im-bottom-nav-tab--active">
          <IconLibrary size={20} /> Library
        </button>
      </div>
    </div>
  )
}
