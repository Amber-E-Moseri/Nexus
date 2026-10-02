import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import SpaceModal from '../../features/spaces/components/SpaceModal'
import { getSpacesByType, SPACE_TYPE_ICONS, SPACE_TYPE_LABELS } from '../../features/spaces'

const GROUP_ORDER = ['department', 'program', 'personal', 'sandbox', 'archived']

const TYPE_BG = {
  department: '#1C5FAD',
  program:    '#6B3FA0',
  group:      '#0891B2',
  personal:   '#4A8F6C',
  sandbox:    '#B45309',
  archived:   '#9CA3AF',
}

function TwEmoji({ emoji, size = 20 }) {
  const pts = [...emoji].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f')
  const src = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${pts.join('-')}.svg`
  return <img src={src} alt={emoji} width={size} height={size} style={{ display: 'block', pointerEvents: 'none' }} />
}

function SpaceIcon({ space, size = 48 }) {
  const emoji = SPACE_TYPE_ICONS[space.space_type] ?? '📁'
  const bg = space.color ? `#${space.color}` : (TYPE_BG[space.space_type] ?? '#5B34C7')
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <TwEmoji emoji={emoji} size={Math.round(size * 0.46)} />
    </div>
  )
}

function SpaceCard({ space, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '16px 18px',
        boxShadow: 'var(--card-shadow)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(14,14,30,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.transform = 'none' }}
    >
      <SpaceIcon space={space} size={48} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {space.name}
          </span>
          {space.status === 'archived' ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 6, padding: '2px 7px' }}>
              Archived
            </span>
          ) : null}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {space.description || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No description</span>}
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: space.color ? `#${space.color}` : (TYPE_BG[space.space_type] ?? '#5B34C7'),
            background: space.color ? `#${space.color}18` : `${TYPE_BG[space.space_type] ?? '#5B34C7'}12`,
            borderRadius: 6, padding: '2px 8px',
          }}>
            {SPACE_TYPE_LABELS[space.space_type] ?? space.space_type}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function SpacesList() {
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [spaceGroups, setSpaceGroups] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('active')
  const [query, setQuery] = useState('')

  async function loadSpaces() {
    const groups = await getSpacesByType(profile.id, role, profile.department_id)
    setSpaceGroups(groups)
  }

  useEffect(() => {
    if (!profile?.id || !role) return
    loadSpaces().catch(() => setSpaceGroups(null))
  }, [profile?.id, profile?.department_id, role])

  const filteredGroups = useMemo(() => {
    if (!spaceGroups) return null
    const term = query.trim().toLowerCase()
    return Object.fromEntries(
      Object.entries(spaceGroups).map(([key, spaces]) => {
        let items = spaces
        if (filter === 'active') items = items.filter((s) => s.status === 'active')
        if (filter === 'archived') items = items.filter((s) => s.status === 'archived')
        if (term) items = items.filter((s) => s.name.toLowerCase().includes(term))
        return [key, items]
      }),
    )
  }, [filter, query, spaceGroups])

  const canCreate = role === 'super_admin' || role === 'dept_lead'
  const totalVisible = filteredGroups ? Object.values(filteredGroups).reduce((sum, arr) => sum + arr.length, 0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)', margin: 0 }}>
            Spaces
          </h1>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
            Departments, programs, and personal workspaces.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 12, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Space
          </button>
        ) : null}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 280 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spaces…"
            style={{
              width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              fontSize: 13, border: '1px solid var(--border)', borderRadius: 999,
              background: '#fff', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'active', 'archived'].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              style={{
                padding: '6px 14px', fontSize: 13, borderRadius: 999, border: '1px solid',
                borderColor: filter === opt ? 'var(--accent)' : 'var(--border)',
                background: filter === opt ? 'var(--accent-light)' : '#fff',
                color: filter === opt ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: filter === opt ? 600 : 400, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        {totalVisible !== null && query ? (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>
            {totalVisible} result{totalVisible !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {/* Groups */}
      {filteredGroups === null ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: 14 }}>
          Loading spaces…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {GROUP_ORDER.map((groupKey) => {
            const items = filteredGroups[groupKey] ?? []
            if (items.length === 0) return null
            const emoji = SPACE_TYPE_ICONS[groupKey]
            const label = groupKey === 'archived' ? 'Archived' : `${SPACE_TYPE_LABELS[groupKey] ?? groupKey}s`
            return (
              <section key={groupKey}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  {emoji ? <TwEmoji emoji={emoji} size={14} /> : null}
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface-secondary)', borderRadius: 999, padding: '1px 7px', fontWeight: 600 }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {items.map((space) => (
                    <SpaceCard key={space.id} space={space} onClick={() => navigate(`/spaces/${space.id}`)} />
                  ))}
                </div>
              </section>
            )
          })}

          {totalVisible === 0 ? (
            <div style={{
              borderRadius: 20, border: '1px dashed var(--border)',
              background: 'var(--surface-tertiary)', padding: '3rem',
              textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14,
            }}>
              No spaces match your filters.
            </div>
          ) : null}
        </div>
      )}

      {showModal ? <SpaceModal onSaved={loadSpaces} onClose={() => setShowModal(false)} /> : null}
    </div>
  )
}
