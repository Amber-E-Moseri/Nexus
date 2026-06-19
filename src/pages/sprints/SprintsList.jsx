import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SprintCard from '../../modules/sprints/SprintCard'
import SprintModal from '../../modules/sprints/SprintModal'
import { useAuth } from '../../hooks/useAuth'
import { deleteSprint, duplicateSprint, getAllSprints, getMySprints, restoreSprint } from '../../lib/sprints'

const FILTERS = ['all', 'active', 'planning', 'completed', 'review', 'archived']
const STATUS_ORDER = ['active', 'planning', 'completed', 'review', 'archived']
const EMPTY_STATE = {
  icon: '⚡',
  title: 'No sprints yet',
  subtitle: 'Create a sprint to coordinate a cross-department initiative',
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{EMPTY_STATE.icon}</div>
      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {EMPTY_STATE.title}
      </div>
      <div>{EMPTY_STATE.subtitle}</div>
    </div>
  )
}

export default function SprintsList() {
  const { role, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sprints, setSprints] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(searchParams.get('new') === 'true')
  const [loading, setLoading] = useState(true)
  const [showArchivedGroup, setShowArchivedGroup] = useState(false)

  async function loadSprints() {
    setLoading(true)
    try {
      const data = role === 'super_admin' ? await getAllSprints() : await getMySprints()
      setSprints(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSprints()
  }, [role])

  useEffect(() => {
    const wantsNew = searchParams.get('new') === 'true'
    setShowModal(wantsNew)
  }, [searchParams])

  const searched = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return sprints

    return sprints.filter((sprint) =>
      [sprint.name, sprint.goal, sprint.description, sprint.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    )
  }, [query, sprints])

  const filtered = useMemo(
    () => (filter === 'all' ? searched : searched.filter((sprint) => sprint.status === filter)),
    [filter, searched],
  )

  const grouped = useMemo(
    () => STATUS_ORDER.map((status) => ({ status, items: searched.filter((sprint) => sprint.status === status) })),
    [searched],
  )

  async function handleDuplicate(sprintId) {
    await duplicateSprint(sprintId, profile.id)
    await loadSprints()
  }

  async function handleRestore(sprintId) {
    await restoreSprint(sprintId)
    await loadSprints()
  }

  async function handleDelete(sprintId, sprintName) {
    if (!window.confirm(`Delete "${sprintName}"? This cannot be undone.`)) return
    await deleteSprint(sprintId)
    await loadSprints()
  }

  function closeModal() {
    setShowModal(false)
    if (searchParams.get('new') === 'true') {
      setSearchParams({})
    }
  }

  const canCreate = role === 'super_admin' || role === 'dept_lead'
  const hasAnySprints = grouped.some(({ items }) => items.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Sprints</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Temporary cross-functional initiatives running alongside department spaces.</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
          >
            + New Sprint
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sprints"
          className="min-w-[220px] rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-sm text-[var(--text-primary)]"
        />
        {FILTERS.map((option) => (
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

      {loading ? (
        <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Loading...
        </div>
      ) : filter === 'all' ? (
        hasAnySprints ? (
          <div className="space-y-6">
            {grouped.map(({ status, items }) => {
              if (items.length === 0) return null
              const collapsed = status === 'archived' && !showArchivedGroup
              return (
                <section key={status} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                      {status} {status === 'archived' && items.length > 0 ? `(${items.length})` : ''}
                    </h2>
                    {status === 'archived' ? (
                      <button
                        type="button"
                        onClick={() => setShowArchivedGroup((value) => !value)}
                        className="text-xs text-[var(--accent)]"
                      >
                        {collapsed ? '▶ Show archived' : '▼ Hide archived'}
                      </button>
                    ) : null}
                  </div>
                  {!collapsed ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {items.map((sprint) => (
                        <SprintCard
                          key={sprint.id}
                          sprint={sprint}
                          onClick={() => navigate(`/sprints/${sprint.id}`)}
                          onDuplicate={canCreate ? handleDuplicate : undefined}
                          onRestore={canCreate ? handleRestore : undefined}
                          onDelete={canCreate ? handleDelete : undefined}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        ) : (
          <EmptyState />
        )
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              onClick={() => navigate(`/sprints/${sprint.id}`)}
              onDuplicate={canCreate ? handleDuplicate : undefined}
              onRestore={canCreate ? handleRestore : undefined}
              onDelete={canCreate ? handleDelete : undefined}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}

      {showModal ? <SprintModal initialDepartmentId={profile?.department_id ?? null} onSaved={loadSprints} onClose={closeModal} /> : null}
    </div>
  )
}
