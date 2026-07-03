import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SprintCard from '../../features/sprints/components/SprintCard'
import SprintModal from '../../features/sprints/components/SprintModal'
import { useAuth } from '../../hooks/useAuth'
import { deleteSprint, duplicateSprint, getAllSprints, getMySprints, restoreSprint, listSprintTeamsIndependent } from '../../features/sprints'
import { getSprintTasks } from '../../features/sprints/lib/sprints'
import { supabase } from '../../lib/supabase'

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
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(searchParams.get('new') === 'true')
  const [loading, setLoading] = useState(true)

  async function loadSprints() {
    setLoading(true)
    try {
      const sprintData = role === 'super_admin' ? await getAllSprints() : await getMySprints()

      // Fetch task counts, department info, and team data for each sprint
      const enrichedSprints = await Promise.all(
        sprintData.map(async (sprint) => {
          try {
            const tasks = await getSprintTasks(sprint.id)
            const completed = tasks.filter((t) => t.status_definition?.category === 'completed').length

            // Fetch department name if sprint has a department
            let deptName = null
            if (sprint.department_id) {
              const { data: dept } = await supabase
                .from('departments')
                .select('name')
                .eq('id', sprint.department_id)
                .single()
              deptName = dept?.name
            }

            // Fetch teams and check if user is in any team
            let isUserInTeam = false
            try {
              const teams = await listSprintTeamsIndependent(sprint.id)
              for (const team of teams) {
                const { data: members } = await supabase
                  .from('sprint_team_members')
                  .select('user_id')
                  .eq('team_id', team.id)

                if (members?.some((m) => m.user_id === profile?.id)) {
                  isUserInTeam = true
                  break
                }
              }
            } catch {
              // If team fetch fails, continue without team info
            }

            return {
              ...sprint,
              task_count: tasks.length,
              completed_count: completed,
              department_name: deptName,
              is_user_in_team: isUserInTeam,
            }
          } catch (err) {
            console.error(`Failed to load details for sprint ${sprint.id}:`, err)
            return {
              ...sprint,
              task_count: 0,
              completed_count: 0,
              department_name: null,
              is_user_in_team: false,
            }
          }
        })
      )

      setSprints(enrichedSprints)
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
    () => {
      let result = searched

      // Apply status filter
      if (filter !== 'all') {
        result = result.filter((sprint) => sprint.status === filter)
      }

      // Apply view filter
      if (view === 'my-team') {
        result = result.filter((sprint) => sprint.is_user_in_team)
      }

      return result
    },
    [filter, searched, view],
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

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 rounded-lg bg-[var(--surface-secondary)] p-1">
          <button
            onClick={() => setView('all')}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: view === 'all' ? 600 : 400,
              borderRadius: 6,
              border: 'none',
              background: view === 'all' ? 'white' : 'transparent',
              color: view === 'all' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            All Sprints
          </button>
          <button
            onClick={() => setView('my-team')}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: view === 'my-team' ? 600 : 400,
              borderRadius: 6,
              border: 'none',
              background: view === 'my-team' ? 'white' : 'transparent',
              color: view === 'my-team' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            My Teams
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sprints"
          className="min-w-[220px] rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-sm text-[var(--text-primary)]"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--text-primary)]"
        >
          {FILTERS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
          Loading...
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
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
