import { useNavigate } from 'react-router-dom'
import { IconHome, IconLibrary, IconPlus, IconChevronDown } from '../icons'
import BookCover from '../components/BookCover'

export default function ReaderHomePage({ currentBook, library, currentProgress, onOpenBook, onGoLibrary, onImport }) {
  const navigate = useNavigate()
  const progress = currentBook
    ? Math.round((currentProgress / Math.max(1, (currentBook.sentences?.length ?? 1) - 1)) * 100)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--im-border)', background: 'var(--im-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <button
          onClick={onImport}
          style={{ minHeight: 32, padding: '0 12px', borderRadius: 6, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}
        >
          <IconPlus size={14} color="#fff" /> Import PDF
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Now Reading */}
        {currentBook && (
          <div
            onClick={() => onOpenBook(currentBook)}
            style={{ display: 'flex', gap: 14, padding: 16, background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 12, marginBottom: 28, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
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
              <div style={{ fontSize: 11, color: 'var(--im-text-muted)' }}>{progress}% complete · {currentBook.estimatedMinutes} min read</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
              <IconChevronDown size={16} color="var(--im-text-dim)" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
            </div>
          </div>
        )}

        {/* Library section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--im-text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Library</span>
          {library.length > 0 && (
            <button onClick={onGoLibrary} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--im-blue)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>See all</button>
          )}
        </div>

        {library.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 32px', color: 'var(--im-text-dim)', gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--im-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--im-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 6 }}>Your library is empty</div>
              <div style={{ fontSize: 13, color: 'var(--im-text-dim)', lineHeight: 1.5, maxWidth: 240 }}>Import a PDF to start reading with AI-powered audio narration.</div>
            </div>
            <button
              onClick={onImport}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 8, background: 'var(--im-blue)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif', marginTop: 4 }}
            >
              <IconPlus size={15} color="#fff" /> Import your first book
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 16 }}>
            {library.slice(0, 8).map((book) => (
              <div key={book.id} onClick={() => onOpenBook(book)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <BookCover title={book.title} width="100%" height={120} />
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{book.title}</div>
                <div style={{ fontSize: 10, color: 'var(--im-text-dim)' }}>{book.estimatedMinutes}m</div>
              </div>
            ))}
            {library.length > 8 && (
              <div onClick={onGoLibrary} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 6, background: 'var(--im-border-lt)', border: '2px dashed var(--im-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--im-text-dim)' }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>+{library.length - 8}</span>
                  <span style={{ fontSize: 10, fontWeight: 600 }}>more</span>
                </div>
              </div>
            )}
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
