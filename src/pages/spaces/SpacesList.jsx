import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import SpaceModal from '../../features/spaces/components/SpaceModal'
import { getSpacesByType, SPACE_TYPE_ICONS, SPACE_TYPE_LABELS } from '../../features/spaces'

const GROUP_ORDER = ['department', 'program', 'personal', 'sandbox', 'archived']

function SpaceCard({ space, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[20px] border border-[var(--border)] bg-white p-5 text-left shadow-[var(--card-shadow)] transition hover:-translate-y-0.5"
      style={{ borderLeft: `4px solid #${space.color}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-[var(--text-primary)]">{space.name}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">{space.description || 'No description'}</div>
        </div>
        <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {SPACE_TYPE_LABELS[space.space_type] ?? space.space_type}
        </span>
      </div>
      {space.status === 'archived' ? (
        <div className="mt-3 text-xs text-[var(--text-tertiary)]">Archived</div>
      ) : null}
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
        if (filter === 'active') items = items.filter((space) => space.status === 'active')
        if (filter === 'archived') items = items.filter((space) => space.status === 'archived')
        if (term) {
          items = items.filter((space) => space.name.toLowerCase().includes(term))
        }
        return [key, items]
      }),
    )
  }, [filter, query, spaceGroups])

  const canCreate = role === 'super_admin' || role === 'dept_lead'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Spaces</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Departments, programs, personal spaces, and sandboxes in one workspace directory.</p>
        </div>
        {canCreate ? (
          <button type="button" onClick={() => setShowModal(true)} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            + New Space
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search spaces"
          className="min-w-[220px] rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-sm text-[var(--text-primary)]"
        />
        {['all', 'active', 'archived'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className="rounded-full border px-3 py-1.5 text-sm capitalize"
            style={{
              borderColor: filter === option ? 'var(--accent)' : 'var(--border)',
              background: filter === option ? 'var(--accent-light)' : 'white',
              color: filter === option ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {GROUP_ORDER.map((groupKey) => {
          const items = filteredGroups?.[groupKey] ?? []
          if (items.length === 0) return null
          return (
            <section key={groupKey} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                {SPACE_TYPE_ICONS[groupKey] ? `${SPACE_TYPE_ICONS[groupKey]} ` : ''}{groupKey === 'archived' ? 'Archived' : `${SPACE_TYPE_LABELS[groupKey]}s`}
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {items.map((space) => (
                  <SpaceCard key={space.id} space={space} onClick={() => navigate(`/spaces/${space.id}`)} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {showModal ? <SpaceModal onSaved={loadSpaces} onClose={() => setShowModal(false)} /> : null}
    </div>
  )
}
