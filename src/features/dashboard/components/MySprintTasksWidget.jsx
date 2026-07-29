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
        // Fetch open tasks assigned to user that belong to a sprint
        const { data } = await supabase
          .from('tasks')
          .select(`
            id, title, due_date,
            sprint_id,
            sprint:sprints!sprint_id(id, name, status),
            status_definition:task_status_definitions!status_id(category, color, name)
          `)
          .eq('assignee_id', userId)
          .not('sprint_id', 'is', null)
          .limit(40)

        if (!active) return

        // Filter to open tasks in active sprints
        const ACTIVE_SPRINT_STATUSES = new Set(['planning', 'active', 'review'])
        const open = (data ?? []).filter(
          (t) =>
            ACTIVE_SPRINT_STATUSES.has(t.sprint?.status) &&
            t.status_definition?.category !== 'completed' &&
            t.status_definition?.category !== 'cancelled',
        )

        // Group by sprint
        const sprintMap = new Map()
        for (const task of open) {
          const sid = task.sprint_id
          if (!sprintMap.has(sid)) sprintMap.set(sid, { sprint: task.sprint, tasks: [] })
          sprintMap.get(sid).tasks.push(task)
        }

        // Sort each sprint's tasks by due date (nulls last)
        const grouped = [...sprintMap.values()].map((g) => ({
          ...g,
          tasks: g.tasks.sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return a.due_date.localeCompare(b.due_date)
          }),
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
      No open sprint tasks assigned to you.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(({ sprint, tasks }) => {
        const col = SPRINT_STATUS_COLORS[sprint?.status] ?? SPRINT_STATUS_COLORS.active
        return (
          <div key={sprint?.id}>
            {/* Sprint header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-1)' }}>
                {sprint?.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: col.bg, color: col.text }}>
                {sprint?.status}
              </span>
            </div>

            {/* Tasks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 4 }}>
              {tasks.map((task) => {
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
              })}
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
