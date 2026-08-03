import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X, TrendingUp, Trophy } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import WinsSheet from '../../features/wins/components/WinsSheet'
import { searchWins } from '../../features/wins/lib/wins'
import GrowthTrackingPage from '../growth/GrowthTrackingPage'

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

function formatWeekLabel(weekStart) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return `${weekStart.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function SearchResults({ results, isLoading, query }) {
  if (isLoading) return <div style={{ fontSize: 12.5, color: MUTED, padding: '12px 0' }}>Searching…</div>
  if (!results.length) return <div style={{ fontSize: 12.5, color: MUTED, padding: '12px 0' }}>No wins matching "{query}"</div>
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 10 }}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map((win) => (
        <div key={win.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>🙌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{win.content}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: MUTED }}>{win.author?.name ?? 'Someone'}</span>
              <span style={{ fontSize: 11, color: BORDER }}>·</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>
                Week of {formatWeekLabel(new Date(win.week_start + 'T00:00:00'))}
              </span>
              {win.task?.title && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, background: `${GREEN}18`, borderRadius: 999, padding: '2px 8px' }}>
                  ✓ {win.task.title}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function WinsContent({ departmentId }) {
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 380 }}>
          <Search size={13} color={MUTED} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search wins…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 30, paddingRight: searchRaw ? 28 : 10,
              paddingTop: 7, paddingBottom: 7,
              border: `1px solid ${BORDER}`, borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = PRIMARY }}
            onBlur={(e) => { e.currentTarget.style.borderColor = BORDER }}
          />
          {searchRaw && (
            <button onClick={() => setSearchRaw('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: MUTED, cursor: 'pointer', display: 'flex', padding: 2 }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Week nav (hidden while searching) */}
        {!isSearching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setWeekStart((w) => addWeeks(w, -1))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, display: 'flex', padding: '4px 5px', borderRadius: 6 }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, minWidth: 155, textAlign: 'center' }}>
              {formatWeekLabel(weekStart)}
            </span>
            <button onClick={() => setWeekStart((w) => addWeeks(w, 1))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, display: 'flex', padding: '4px 5px', borderRadius: 6 }}>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {isSearching ? (
        <SearchResults results={searchResults} isLoading={searchLoading} query={search} />
      ) : (
        <WinsSheet departmentId={departmentId} weekStart={weekStart} unbounded />
      )}
    </div>
  )
}

function AppIcon({ icon: Icon, label, color, bg, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '18px 12px', width: 100,
        border: active ? `2px solid ${PRIMARY}` : `2px solid transparent`,
        borderRadius: 16,
        background: active ? `${PRIMARY}0D` : '#fff',
        cursor: 'pointer', transition: 'all .15s',
        boxShadow: active ? `0 0 0 1px ${PRIMARY}30` : '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F7F4EF' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#fff' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.10)' }}>
        <Icon size={22} color={color} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, textAlign: 'center', lineHeight: 1.3, fontFamily: 'inherit' }}>{label}</span>
    </button>
  )
}

export default function AppsPage() {
  const { profile } = useAuth()
  const departmentId = profile?.department_id
  const isSuperAdmin = profile?.role === 'super_admin'
  const [activeApp, setActiveApp] = useState('wins')

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Inter' }}>

      {/* Page header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '24px 32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px', color: TEXT }}>Apps</h1>

        {/* Icon launcher row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AppIcon
            icon={Trophy}
            label="Wins"
            color="#4C2A92"
            bg="linear-gradient(135deg, #EDE8DC 0%, #F5F0FF 100%)"
            active={activeApp === 'wins'}
            onClick={() => setActiveApp('wins')}
          />
          {isSuperAdmin && (
            <AppIcon
              icon={TrendingUp}
              label="Growth Tracking"
              color="#1F8A4C"
              bg="linear-gradient(135deg, #E8F5EC 0%, #D4EDDA 100%)"
              active={activeApp === 'growth'}
              onClick={() => setActiveApp('growth')}
            />
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 24px 64px' }}>
        {activeApp === 'wins' && (
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Trophy size={16} color={PRIMARY} />
              <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Wins</span>
            </div>
            <WinsContent departmentId={departmentId} />
          </div>
        )}

        {activeApp === 'growth' && isSuperAdmin && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            <GrowthTrackingPage embedded />
          </div>
        )}
      </div>
    </div>
  )
}
