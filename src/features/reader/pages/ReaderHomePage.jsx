import { IconHome, IconLibrary, IconPlus, IconChevronDown } from '../icons'

export default function ReaderHomePage({ currentBook, library, currentProgress, onOpenBook, onGoLibrary, onImport }) {
  const progress = currentBook ? Math.round((currentProgress / Math.max(1, (currentBook.sentences?.length ?? 1) - 1)) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--im-text)', lineHeight: 1.1 }}>Immerse</div>
            <div style={{ fontSize: 13, color: 'var(--im-text-dim)', marginTop: 2 }}>Resume your reading</div>
          </div>
          <button
            onClick={onImport}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--im-blue)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(14,165,233,0.35)' }}
          >
            <IconPlus size={18} color="#fff" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Now Reading */}
        {currentBook && (
          <div
            onClick={() => onOpenBook(currentBook)}
            style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 12, marginBottom: 24, cursor: 'pointer' }}
          >
            <div style={{ width: 80, height: 110, background: '#E5E7EB', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBook.title}</div>
              {currentBook.author && <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 8 }}>{currentBook.author}</div>}
              <div style={{ height: 4, background: 'var(--im-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--im-blue), var(--im-blue-lt))', width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--im-text-muted)' }}>{progress}% complete · {currentBook.estimatedMinutes} min read</div>
            </div>
            <IconChevronDown size={16} color="var(--im-text-dim)" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
          </div>
        )}

        {/* Library section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--im-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Your Library</span>
          <button onClick={onGoLibrary} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>See all</button>
        </div>

        {library.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--im-text-dim)', fontSize: 14 }}>
            No books yet. Tap + to import a PDF.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
            {library.map((book) => (
              <div key={book.id} onClick={() => onOpenBook(book)} style={{ cursor: 'pointer' }}>
                <div style={{ width: '100%', aspectRatio: '2/3', background: '#E5E7EB', borderRadius: 8, marginBottom: 6 }} />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)' }}>{book.estimatedMinutes}m</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="im-bottom-nav">
        <button className="im-bottom-nav-tab im-bottom-nav-tab--active">
          <IconHome size={20} /> Home
        </button>
        <button className="im-bottom-nav-tab" onClick={onGoLibrary}>
          <IconLibrary size={20} /> Library
        </button>
      </div>
    </div>
  )
}
