import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import WinsSheet from '../../features/wins/components/WinsSheet'
import { searchWins } from '../../features/wins/lib/wins'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'
const GREEN = '#3E7C4F'

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function addWeeks(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatWeekLabel(weekStart) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return `${weekStart.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function SearchResults({ results, isLoading, query }) {
  if (isLoading) return <div style={{ fontSize: 12.5, color: MUTED, padding: '12px 0' }}>Searching…</div>
  if (!results.length) {
    return <div style={{ fontSize: 12.5, color: MUTED, padding: '12px 0' }}>No wins matching "{query}"</div>
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 10 }}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map((win) => {
        const weekDate = new Date(win.week_start + 'T00:00:00')
        return (
          <div key={win.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>🙌</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{win.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: MUTED }}>{win.author?.name ?? 'Someone'}</span>
                <span style={{ fontSize: 11, color: BORDER }}>·</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>Week of {formatWeekLabel(weekDate)}</span>
                {win.task?.title && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: `${GREEN}18`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                    ✓ {win.task.title}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function WinsPage() {
  const { profile } = useAuth()
  const departmentId = profile?.department_id

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [searchRaw, setSearchRaw] = useState('')
  const search = searchRaw.trim()
  const isSearching = search.length >= 2

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['wins_search', departmentId, search],
    queryFn: () => searchWins(departmentId, search),
    enabled: Boolean(departmentId && isSearching),
    staleTime: 10_000,
  })

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Inter' }}>

      {/* Page header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '20px 32px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Trophy size={20} color={PRIMARY} />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: TEXT }}>Wins</h1>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search size={14} color={MUTED} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search wins by content…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 32, paddingRight: searchRaw ? 32 : 12,
              paddingTop: 8, paddingBottom: 8,
              border: `1px solid ${BORDER}`, borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = PRIMARY }}
            onBlur={(e) => { e.currentTarget.style.borderColor = BORDER }}
          />
          {searchRaw && (
            <button
              onClick={() => setSearchRaw('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: MUTED, cursor: 'pointer', display: 'flex', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px 64px' }}>

        {/* Wins card */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 16 }}>🙌</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT, flex: 1 }}>
              {isSearching ? 'Search Results' : 'Wins This Week'}
            </span>
            {!isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => setWeekStart((w) => addWeeks(w, -1))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, display: 'flex', padding: '4px 6px', borderRadius: 6 }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, minWidth: 150, textAlign: 'center' }}>
                  {formatWeekLabel(weekStart)}
                </span>
                <button
                  onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, display: 'flex', padding: '4px 6px', borderRadius: 6 }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Card body */}
          <div style={{ padding: '16px 20px' }}>
            {isSearching ? (
              <SearchResults results={searchResults} isLoading={searchLoading} query={search} />
            ) : (
              <WinsSheet departmentId={departmentId} weekStart={weekStart} unbounded />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
