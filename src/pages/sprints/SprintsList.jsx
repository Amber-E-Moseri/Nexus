import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SprintCard from '../../features/sprints/components/SprintCard'
import SprintModal from '../../features/sprints/components/SprintModal'
import { useAuth } from '../../hooks/useAuth'
import { deleteSprint, duplicateSprint, getAllSprints, getMySprints, restoreSprint } from '../../features/sprints'
import { getSprintTasks } from '../../features/sprints/lib/sprints'
import { supabase } from '../../lib/supabase'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
}

const cardEnter = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 34 } },
}

const FILTERS = ['all', 'active', 'planning', 'completed', 'review', 'archived']
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
  const wantsNewSprint = searchParams.get('new') === '1' || searchParams.get('new') === 'true'
  const [sprints, setSprints] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(wantsNewSprint)
  const [loading, setLoading] = useState(true)

  async function loadSprints() {
    setLoading(true)
    try {
      const sprintData = role === 'super_admin' ? await getAllSprints() : await getMySprints()

      const enrichedSprints = await Promise.all(
        sprintData.map(async (sprint) => {
          let deptName = null
          if (sprint.department_id) {
            const { data: dept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', sprint.department_id)
              .single()
            deptName = dept?.name
          }

          try {
            const tasks = await getSprintTasks(sprint.id)
            const completed = tasks.filter((t) => t.status_definition?.category === 'completed').length

            return {
              ...sprint,
              task_count: tasks.length,
              completed_count: completed,
              department_name: deptName,
              has_access: true,
            }
          } catch (err) {
            console.error(`Failed to load details for sprint ${sprint.id}:`, err)
            return {
              ...sprint,
              task_count: 0,
              completed_count: 0,
              department_name: deptName,
              has_access: true,
            }
          }
        }),
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
    const wantsNew = searchParams.get('new') === '1' || searchParams.get('new') === 'true'
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

  const filtered = useMemo(() => {
    let result = searched

    if (filter !== 'all') {
      result = result.filter((sprint) => sprint.status === filter)
    }

    return result
  }, [filter, searched])

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
    if (searchParams.get('new') === '1' || searchParams.get('new') === 'true') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('new')
      nextParams.delete('event_id')
      nextParams.delete('name')
      nextParams.delete('dept')
      setSearchParams(nextParams)
    }
  }

  async function handleSprintSaved(savedSprint) {
    const eventId = searchParams.get('event_id')

    if (eventId && savedSprint?.id) {
      const { data: linked, error } = await supabase.rpc('link_calendar_event_sprint', {
        p_event_id: eventId,
        p_sprint_id: savedSprint.id,
      })

      if (error) {
        console.error('Failed to link sprint to event:', error)
      } else if (!linked) {
        console.warn('link_calendar_event_sprint: 0 rows updated — event may already be linked, not approved, or caller lacks access')
      }
    }

    await loadSprints()
    closeModal()
  }

  const canCreate = role === 'super_admin' || role === 'dept_lead'

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px]" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>Sprints</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>Temporary cross-functional initiatives running alongside department spaces.</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--purple-700)', transition: 'background .13s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-600)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--purple-700)' }}
          >
            + New Sprint
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sprints"
          className="min-w-[220px] rounded-full px-4 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)' }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)' }}
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
        <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-3">
          {filtered.map((sprint) => (
            <motion.div key={sprint.id} variants={cardEnter}>
              <SprintCard
                sprint={sprint}
                hasAccess={true}
                accessRequestStatus={null}
                onClick={() => navigate(`/sprints/${sprint.id}`)}
                onRequestAccess={undefined}
                onDuplicate={canCreate ? handleDuplicate : undefined}
                onRestore={canCreate ? handleRestore : undefined}
                onDelete={canCreate ? handleDelete : undefined}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <EmptyState />
      )}

      {showModal ? (
        <SprintModal
          initialDepartmentId={searchParams.get('dept') || profile?.department_id || null}
          initialName={searchParams.get('name') ?? ''}
          onSaved={handleSprintSaved}
          onClose={closeModal}
        />
      ) : null}
    </div>
  )
}
