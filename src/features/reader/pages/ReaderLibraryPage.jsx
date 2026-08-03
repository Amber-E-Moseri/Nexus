import { useState } from 'react'
import { IconHome, IconLibrary, IconDocument, IconGlobe, IconFlame, IconTarget, IconSearch, IconPlus } from '../icons'

export default function ReaderLibraryPage({ library, credits, onOpenBook, onGoHome, onImport, onBuyCredits }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('books')

  const filtered = library.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--im-text)' }}>Library</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconFlame size={12} color="#92400E" /> 7 day streak
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--im-blue-bg-2)', color: 'var(--im-blue-xdark)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconTarget size={12} color="var(--im-blue-xdark)" /> 2h/week
            </span>
            <button
              onClick={onImport}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--im-blue)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <IconPlus size={16} color="#fff" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--im-border)', marginBottom: 12 }}>
          {[['books', 'My Books', <IconLibrary size={13} />], ['pdfs', 'PDFs', <IconDocument size={13} />], ['web', 'Web', <IconGlobe size={13} />]].map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: tab === key ? 'var(--im-blue)' : 'var(--im-text-dim)', borderBottom: tab === key ? '2px solid var(--im-blue)' : '2px solid transparent', marginBottom: -1 }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Search + credits */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <IconSearch size={14} color="var(--im-text-dim)" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library..."
            style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid var(--im-border)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', outline: 'none' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--im-blue)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--im-border)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ padding: '4px 10px', background: 'var(--im-border-lt)', borderRadius: 20, color: 'var(--im-text-muted)', fontWeight: 600 }}>Credits: <strong>{credits} hrs</strong></span>
          <button onClick={onBuyCredits} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-blue)', fontWeight: 600, fontSize: 12, fontFamily: 'Inter, sans-serif' }}>+ Buy</button>
        </div>
      </div>

      {/* Book list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--im-text-dim)', fontSize: 14 }}>
            No books yet. Tap + to import a PDF.
          </div>
        ) : (
          filtered.map((book) => (
            <div
              key={book.id}
              onClick={() => onOpenBook(book)}
              style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--im-border-lt)', cursor: 'pointer' }}
            >
              <div style={{ width: 50, height: 70, background: '#E5E7EB', borderRadius: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--im-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                {book.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 6 }}>{book.author}</div>}
                <div style={{ height: 3, background: 'var(--im-border)', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), var(--im-blue-lt))', width: '5%' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)' }}>{book.estimatedMinutes} min · In progress</div>
              </div>
            </div>
          ))
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
