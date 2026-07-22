import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SprintCard from '../../features/sprints/components/SprintCard'
import SprintModal from '../../features/sprints/components/SprintModal'
import { useAuth } from '../../hooks/useAuth'
import { deleteSprint, duplicateSprint, getAllSprints, getMySprints, restoreSprint } from '../../features/sprints'
import { requestSprintAccess, getMySprintAccessRequests } from '../../lib/people/api'
import { useToast } from '../../context/ToastContext'
import { getSprintTasks } from '../../features/sprints/lib/sprints'
import { supabase } from '../../lib/supabase'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'
import { hasSpaceRole } from '../../lib/permissions'

const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
}

const cardEnter = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 34 } },
}

const FILTERS = ['all', 'active', 'planning', 'completed', 'review', 'archived']
const CATEGORY_FILTERS = ['all', 'group', 'regional']
const CATEGORY_LABELS = { all: 'All categories', group: 'Group', regional: 'Regional' }
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
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsNewSprint = searchParams.get('new') === '1' || searchParams.get('new') === 'true'
  const [sprints, setSprints] = useState([])
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(wantsNewSprint)
  const [loading, setLoading] = useState(true)

  async function loadSprints() {
    setLoading(true)
    try {
      // regional_secretary deliberately excluded — sprints (unlike meetings/
      // tasks elsewhere in this app) are membership-gated for everyone
      // except super_admin/programs/ors; a regional_secretary who wants
      // into a sprint requests access like anyone else. Matches
      // can_manage_sprint()'s own authority model, which never granted
      // regional_secretary a blanket bypass either.
      const canSeeAll =
        role === 'super_admin' ||
        hasSpaceRole(profile, null, 'ors') ||
        hasSpaceRole(profile, null, 'programs')

      const [allSprints, memberSprints, myRequests] = await Promise.all([
        getAllSprints(),
        canSeeAll ? Promise.resolve([]) : getMySprints(),
        canSeeAll ? Promise.resolve([]) : getMySprintAccessRequests(),
      ])

      const memberIds = canSeeAll
        ? new Set(allSprints.map((s) => s.id))
        : new Set(memberSprints.map((s) => s.id))

      const requestMap = Object.fromEntries(myRequests.map((r) => [r.sprint_id, r.status]))

      const enrichedSprints = await Promise.all(
        allSprints.map(async (sprint) => {
          let deptName = null
          if (sprint.department_id) {
            const { data: dept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', sprint.department_id)
              .single()
            deptName = dept?.name
          }

          const hasAccess = memberIds.has(sprint.id)

          if (!hasAccess) {
            return {
              ...sprint,
              task_count: 0,
              completed_count: 0,
              department_name: deptName,
              has_access: false,
              accessRequestStatus: requestMap[sprint.id] ?? null,
            }
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
              accessRequestStatus: null,
            }
          } catch (err) {
            console.error(`Failed to load details for sprint ${sprint.id}:`, err)
            return {
              ...sprint,
              task_count: 0,
              completed_count: 0,
              department_name: deptName,
              has_access: true,
              accessRequestStatus: null,
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

    if (filter === 'active') {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      result = result.filter(
        (s) =>
          s.status === 'active' &&
          (!s.start_date || s.start_date <= today) &&
          (!s.end_date || s.end_date >= today),
      )
    } else if (filter !== 'all') {
      result = result.filter((s) => s.status === filter)
    }

    if (categoryFilter !== 'all') {
      result = result.filter((s) => s.category === categoryFilter)
    }

    return result
  }, [filter, categoryFilter, searched])

  async function handleDuplicate(sprintId) {
    await duplicateSprint(sprintId, profile.id)
    await loadSprints()
  }

  async function handleRestore(sprintId) {
    await restoreSprint(sprintId)
    await loadSprints()
  }

  async function handleDelete(sprintId, sprintName) {
    const sprint = sprints.find((s) => s.id === sprintId)
    if (sprint?.status === 'active') {
      showToast('Complete or archive this sprint before deleting it.', 'error')
      return
    }
    if (!window.confirm(`Delete "${sprintName}"? This cannot be undone.`)) return
    await deleteSprint(sprintId)
    await loadSprints()
  }

  async function handleRequestAccess(sprintId) {
    await requestSprintAccess(sprintId)
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

  const canCreate = role === 'super_admin' || role === 'dept_lead' || role === 'pastor' || role === 'regional_secretary'

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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)' }}
        >
          {CATEGORY_FILTERS.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABELS[option]}
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
                hasAccess={sprint.has_access}
                accessRequestStatus={sprint.accessRequestStatus}
                onClick={sprint.has_access ? () => navigate(`/sprints/${sprint.id}`) : undefined}
                onRequestAccess={() => handleRequestAccess(sprint.id)}
                onDuplicate={canCreate && sprint.has_access ? handleDuplicate : undefined}
                onRestore={canCreate && sprint.has_access ? handleRestore : undefined}
                onDelete={canCreate && sprint.has_access ? handleDelete : undefined}
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
