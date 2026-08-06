import { useEffect, useState } from 'react'
import { listUsersForAdmin, getAllCredits, giftCredits, shareBook, listShareHistory, READER_TAGS } from '../services/reader-admin'
import { IconBack } from '../icons'

const TAG_COLORS = {
  Leadership: '#6366F1', 'Spiritual Growth': '#8B5CF6', Ministry: '#EC4899',
  'Personal Development': '#0EA5E9', Finance: '#10B981', Communication: '#F59E0B',
  Prayer: '#A78BFA', Evangelism: '#F97316', Management: '#14B8A6', Other: '#9CA3AF',
}

export default function AdminPanel({ myBooks, onBack }) {
  const [tab, setTab] = useState('credits')
  const [users, setUsers] = useState([])
  const [credits, setCredits] = useState({})
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  // Gift state
  const [giftTarget, setGiftTarget] = useState(null)
  const [giftHours, setGiftHours] = useState('')
  const [giftNote, setGiftNote] = useState('')
  const [giftRecurring, setGiftRecurring] = useState(false)
  const [gifting, setGifting] = useState(false)

  // Share state
  const [selectedBook, setSelectedBook] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)
  const [selectedTag, setSelectedTag] = useState('')
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    Promise.all([listUsersForAdmin(), getAllCredits(), listShareHistory()])
      .then(([u, c, h]) => { setUsers(u); setCredits(c); setHistory(h) })
      .catch((err) => console.error('AdminPanel load failed:', err?.message ?? err))
      .finally(() => setLoading(false))
  }, [])

  function showToast(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleGift() {
    const h = parseFloat(giftHours)
    if (!h || h <= 0 || !giftTarget) return
    setGifting(true)
    try {
      await giftCredits(giftTarget.id, h, giftNote, giftRecurring)
      const newBalance = (credits[giftTarget.id] ?? 0) + h * 60
      setCredits((prev) => ({ ...prev, [giftTarget.id]: newBalance }))
      showToast(`✓ Gifted ${h}h to ${giftTarget.name}${giftRecurring ? ' (recurring)' : ''}`, true)
      setGiftTarget(null); setGiftHours(''); setGiftNote(''); setGiftRecurring(false)
    } catch (err) {
      showToast(err?.message ?? 'Failed to gift credits', false)
    } finally {
      setGifting(false)
    }
  }

  async function handleShareToUser(book, user, tag) {
    setSharing(true)
    try {
      await shareBook(book, user.id, tag || null)
      setHistory((prev) => [...prev, { source_book_id: book.id, shared_with: user.id }])
      showToast(`"${book.title}" shared with ${user.name ?? user.email}`)
    } catch (err) {
      showToast(err?.message ?? 'Failed to share book', false)
    } finally {
      setSharing(false)
    }
  }

  const filtered = users.filter((u) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const isAlreadyShared = (bookId, userId) => history.some((h) => h.source_book_id === bookId && h.shared_with === userId)
  const fmtHrs = (mins) => { const h = (mins ?? 0) / 60; return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h` }

  return (
    <div className="immerse-app" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="im-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--im-blue)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif' }}>
          <IconBack size={15} /> Library
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--im-text)' }}>Immerse Admin</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--im-border)' }}>
        {[['credits', 'Credits'], ['books', 'Share Books']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: tab === t ? 'var(--im-blue)' : 'var(--im-text-muted)', borderBottom: tab === t ? '2px solid var(--im-blue)' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--im-text-dim)', paddingTop: 60, fontSize: 13 }}>Loading…</div>
        ) : tab === 'credits' ? (
          <>
            <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--im-border)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-card)', marginBottom: 14, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((u) => (
                <div key={u.id} style={{ background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--im-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--im-blue)', flexShrink: 0 }}>
                    {(u.name ?? u.email ?? '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name ?? u.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--im-text-dim)', marginTop: 1 }}>{u.role} · {fmtHrs(credits[u.id])} remaining</div>
                  </div>
                  <button onClick={() => setGiftTarget(u)} style={{ padding: '5px 12px', background: 'var(--im-blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
                    Gift
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Books tab — 2-column layout */
          <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
            {/* Left: my books */}
            <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={sectionLabel}>My Books</div>
              {myBooks.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--im-text-dim)' }}>No books yet.</div>
                : myBooks.map((b) => (
                  <button key={b.id} onClick={() => { setSelectedBook(b); setShareTarget(null); setSelectedTag(b.tag || '') }}
                    style={{ textAlign: 'left', padding: '10px 12px', background: selectedBook?.id === b.id ? 'var(--im-blue-bg)' : 'var(--im-card)', border: `1px solid ${selectedBook?.id === b.id ? 'var(--im-blue)' : 'var(--im-border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--im-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                    {b.author && <div style={{ fontSize: 11, color: 'var(--im-text-dim)', marginTop: 1 }}>{b.author}</div>}
                    {b.tag && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: (TAG_COLORS[b.tag] ?? '#9CA3AF') + '22', color: TAG_COLORS[b.tag] ?? '#9CA3AF' }}>{b.tag}</span>}
                  </button>
                ))}
            </div>

            {/* Right: tag picker + user list */}
            {selectedBook ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={sectionLabel}>Tag for recipients</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  <button onClick={() => setSelectedTag('')} style={{ ...tagBtn, background: !selectedTag ? 'var(--im-border)' : 'transparent', color: !selectedTag ? 'var(--im-text)' : 'var(--im-text-dim)' }}>None</button>
                  {READER_TAGS.map((t) => (
                    <button key={t} onClick={() => setSelectedTag(t)} style={{ ...tagBtn, background: selectedTag === t ? (TAG_COLORS[t] + '22') : 'transparent', color: selectedTag === t ? TAG_COLORS[t] : 'var(--im-text-dim)', borderColor: selectedTag === t ? TAG_COLORS[t] : 'var(--im-border)' }}>{t}</button>
                  ))}
                </div>

                <div style={sectionLabel}>Share "{selectedBook.title}" with</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {users.map((u) => {
                    const already = isAlreadyShared(selectedBook.id, u.id)
                    return (
                      <div key={u.id} style={{ background: 'var(--im-card)', border: '1px solid var(--im-border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--im-text)' }}>{u.name ?? u.email}</div>
                          <div style={{ fontSize: 11, color: 'var(--im-text-dim)', marginTop: 1 }}>{u.role}</div>
                        </div>
                        {already ? (
                          <span style={{ fontSize: 11, color: 'var(--im-blue)', fontWeight: 600 }}>Shared ✓</span>
                        ) : shareTarget?.id === u.id && sharing ? (
                          <span style={{ fontSize: 11, color: 'var(--im-text-dim)' }}>Sharing…</span>
                        ) : (
                          <button onClick={() => handleShareToUser(selectedBook, u, selectedTag)} disabled={sharing}
                            style={{ padding: '4px 10px', background: 'var(--im-blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: sharing ? 0.5 : 1 }}>
                            Share
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--im-text-dim)', fontSize: 13 }}>
                ← Select a book
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gift modal */}
      {giftTarget && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--im-card)', borderRadius: 16, padding: 28, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--im-text)', marginBottom: 4 }}>Gift Credits</div>
            <div style={{ fontSize: 12, color: 'var(--im-text-dim)', marginBottom: 20 }}>To: {giftTarget.name ?? giftTarget.email} · {fmtHrs(credits[giftTarget.id])} remaining</div>

            <label style={labelStyle}>Hours to gift</label>
            <input type="number" min="0.5" step="0.5" value={giftHours} onChange={(e) => setGiftHours(e.target.value)} placeholder="e.g. 5" style={inputStyle} autoFocus />

            <label style={labelStyle}>Note (optional)</label>
            <input value={giftNote} onChange={(e) => setGiftNote(e.target.value)} placeholder="e.g. Monthly allocation" style={inputStyle} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '14px 0 20px', fontSize: 13, color: 'var(--im-text)', fontFamily: 'Inter, sans-serif' }}>
              <input type="checkbox" checked={giftRecurring} onChange={(e) => setGiftRecurring(e.target.checked)} />
              Mark as recurring monthly gift
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setGiftTarget(null)} style={{ flex: 1, padding: 9, background: 'var(--im-border-lt)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: 'var(--im-text-muted)' }}>Cancel</button>
              <button onClick={handleGift} disabled={gifting || !giftHours} style={{ flex: 2, padding: 9, background: 'var(--im-blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: gifting || !giftHours ? 0.6 : 1 }}>
                {gifting ? 'Gifting…' : `Gift ${giftHours || '—'}h`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#10B981' : '#EF4444', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap', zIndex: 300 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )

}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--im-text-dim)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5, fontFamily: 'Inter, sans-serif' }
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--im-border)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--im-text)', background: 'var(--im-bg)', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }
const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--im-text-dim)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 2, fontFamily: 'Inter, sans-serif' }
const tagBtn = { padding: '4px 10px', border: '1px solid var(--im-border)', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 0.1s' }
