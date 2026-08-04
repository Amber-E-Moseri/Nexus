import { useEffect, useState } from 'react'
import { isToday, isBefore, parseISO, startOfDay, format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

const SPRINT_STATUS_COLORS = {
  planning: { bg: '#EDE8F8', text: '#4C2A92' },
  active:   { bg: '#EBF7F1', text: '#2D8653' },
  review:   { bg: '#FFF8EC', text: '#D17A1C' },
}

function dueDateStyle(dateStr) {
  if (!dateStr) return { label: null, color: 'var(--ink-3)' }
  const d = startOfDay(parseISO(`${dateStr}T00:00:00`))
  const today = startOfDay(new Date())
  if (isBefore(d, today)) return { label: format(d, 'MMM d'), color: 'var(--accent-red)' }
  if (isToday(d)) return { label: 'Today', color: 'var(--accent-orange)' }
  return { label: format(d, 'MMM d'), color: 'var(--ink-3)' }
}

export default function MySprintTasksWidget({ userId }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([]) // [{ sprint, tasks[] }]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let active = true

    async function load() {
      setLoading(true)
      try {
        const ACTIVE_SPRINT_STATUSES = new Set(['planning', 'active', 'review'])

        // Step 1a: Direct sprint membership
        const { data: directMembers } = await supabase
          .from('sprint_members')
          .select('sprint_id, sprints!sprint_id(id, name, status)')
          .eq('user_id', userId)

        // Step 1b: Team-based sprint membership (sprint_team_members → sprint_teams → sprint)
        const { data: teamMembers } = await supabase
          .from('sprint_team_members')
          .select('team_id, sprint_teams!team_id(sprint_id, sprints!sprint_id(id, name, status))')
          .eq('user_id', userId)

        if (!active) return

        const directSprintIds = (directMembers ?? [])
          .filter(sm => ACTIVE_SPRINT_STATUSES.has(sm.sprints?.status))
          .map(sm => sm.sprint_id)

        const teamSprintIds = (teamMembers ?? [])
          .map(tm => tm.sprint_teams)
          .filter(Boolean)
          .filter(st => ACTIVE_SPRINT_STATUSES.has(st.sprints?.status))
          .map(st => st.sprint_id)

        const activeSprints = [...new Set([...directSprintIds, ...teamSprintIds])]

        if (activeSprints.length === 0) {
          setGroups([])
          setLoading(false)
          return
        }

        // Step 2: Fetch open tasks in those sprints assigned to this user
        const { data } = await supabase
          .from('tasks')
          .select(`
            id, title, due_date,
            sprint_id,
            sprint:sprints!sprint_id(id, name, status),
            status_definition:task_status_definitions!status_id(category, color, name)
          `)
          .in('sprint_id', activeSprints)
          .eq('assignee_id', userId)
          .limit(200)

        if (!active) return

        // Filter to open tasks
        const open = (data ?? []).filter(
          (t) =>
            t.status_definition?.category !== 'completed' &&
            t.status_definition?.category !== 'cancelled',
        )

        // Group by sprint
        const sprintMap = new Map()
        for (const task of open) {
          const sid = task.sprint_id
          if (!sprintMap.has(sid)) {
            sprintMap.set(sid, { sprint: task.sprint, tasks: [] })
          }
          sprintMap.get(sid).tasks.push(task)
        }

        // Sort by due date (nulls last)
        const sortTasks = (tasks) =>
          tasks.sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return a.due_date.localeCompare(b.due_date)
          })

        const grouped = [...sprintMap.values()].map((g) => ({
          sprint: g.sprint,
          tasks: sortTasks(g.tasks),
        }))

        setGroups(grouped)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [userId])

  if (loading) return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Loading…</div>
  if (groups.length === 0) return (
    <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '16px 0', textAlign: 'center' }}>
      You're not in any active sprints yet.
    </div>
  )

  const hasAnyTasks = groups.some(g => g.tasks.length > 0)
  if (!hasAnyTasks) {
    return (
      <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '16px 0', textAlign: 'center' }}>
        No open tasks in your sprints.
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/sprints')}
            style={{ fontSize: 12, color: 'var(--purple-700)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            View all sprints →
          </button>
        </div>
      </div>
    )
  }

  function TaskRow({ task }) {
    const due = dueDateStyle(task.due_date)
    const statusColor = task.status_definition?.color ?? '#C8BFB2'
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => navigate(`/sprints?task=${task.id}`)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '6px 8px',
          background: 'transparent',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background .1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sub)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.title}
        </span>
        {due.label && (
          <span style={{ fontSize: 11, fontWeight: 600, color: due.color, flexShrink: 0 }}>
            {due.label}
          </span>
        )}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(({ sprint, tasks }) => {
        const col = SPRINT_STATUS_COLORS[sprint?.status] ?? SPRINT_STATUS_COLORS.active
        return (
          <div key={sprint?.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-1)' }}>
                {sprint?.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: col.bg, color: col.text }}>
                {sprint?.status}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 4 }}>
              {tasks.length > 0
                ? tasks.map((task) => <TaskRow key={task.id} task={task} />)
                : <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>No open tasks assigned to you</div>
              }
            </div>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => navigate('/sprints')}
        style={{ fontSize: 12, color: 'var(--purple-700)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 4px' }}
      >
        View all sprints →
      </button>
    </div>
  )
}
