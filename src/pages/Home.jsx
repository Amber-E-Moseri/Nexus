import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Gem, MailPlus, Plus, SquareCheckBig } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getUpcomingEvents } from '../features/calendar'
import { PRIORITY_STYLES } from '../lib/priorities'
import { getMySpaces } from '../features/spaces'
import { getMySprints } from '../features/sprints/lib/sprints'
import { getTaskById } from '../features/tasks'
import { supabase } from '../lib/supabase'
import SpaceModal from '../features/spaces/components/SpaceModal'
import SprintModal from '../features/sprints/components/SprintModal'
import TaskModal from '../features/tasks/components/TaskModal'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../lib/fonts'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function actorInitials(action = '') {
  const parts = action.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

const AVATAR_PALETTE = ['#4C2A92', '#C86520', '#2D7A42', '#C53025', '#1B6B8A', '#7C5CB0']
function avatarBg(str = '') {
  const n = (str.charCodeAt(0) || 0) + (str.charCodeAt(1) || 0)
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length]
}

const PRIO_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

// ─── KPI tile ────────────────────────────────────────────────────────────────
function KpiTile({ label, value, subtitle, bg, textColor = '#fff', subtitleColor, delay = 0 }) {
  return (
    <div
      className="fs-fade-up relative overflow-hidden rounded-2xl p-5 cursor-default transition-[transform,box-shadow] duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(28,22,16,.10)]"
      style={{ background: bg, animationDelay: `${delay}ms` }}
    >
      <div className="text-[10.5px] uppercase tracking-[.05em]" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: textColor, opacity: .8 }}>
        {label}
      </div>
      <div className="mt-1.5 text-[27px] leading-none" style={{ fontFamily: FONT_HEADING, fontWeight: 700, color: textColor }}>
        {value ?? '—'}
      </div>
      <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: subtitleColor ?? textColor, opacity: subtitleColor ? 1 : .75 }}>
        {subtitle}
      </div>
      <div className="absolute -bottom-4 -right-4 h-[72px] w-[72px] rounded-full" style={{ background: 'rgba(255,255,255,.07)' }} />
    </div>
  )
}

// ─── Task row ────────────────────────────────────────────────────────────────
function TaskRow({ task, onClick }) {
  const p = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium
  const due = task.due_date ? new Date(task.due_date + 'T00:00:00') : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isOverdue = due && due < today
  const context = [task.department?.name, task.sprint?.name].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--surface-secondary)] transition-colors text-left"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 16px' }}
    >
      <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: p.text }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{task.title}</div>
        {context && (
          <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{context}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full px-2 py-[2px] text-[10.5px] font-bold" style={{ background: p.bg, color: p.text }}>
          {PRIO_LABEL[task.priority] ?? 'Medium'}
        </span>
        {due && (
          <span className="text-[11px] font-medium tabular-nums" style={{ color: isOverdue ? 'var(--coral-dark)' : 'var(--text-tertiary)' }}>
            {due.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Activity row ─────────────────────────────────────────────────────────────
function ActivityRow({ entry }) {
  const initials = actorInitials(entry.action)
  const bg = avatarBg(initials)
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border-1)] last:border-0">
      <div
        className="mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
        style={{ background: bg }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-[var(--text-primary)] leading-[1.4]">{entry.action}</div>
        <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{timeAgo(entry.timestamp)}</div>
      </div>
    </div>
  )
}

// ─── Quick action row ─────────────────────────────────────────────────────────
function QuickRow({ icon, label, to, external }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)' }}>
        {typeof icon === 'string'
          ? <span className="text-sm font-bold text-white" style={{ background: 'var(--accent)', borderRadius: 4, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
          : <span style={{ color: 'var(--accent)' }}>{icon}</span>
        }
      </div>
      <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">{label}</span>
      <span className="text-sm text-[var(--text-tertiary)]">→</span>
    </div>
  )

  if (external) return <a href={to}>{inner}</a>
  return <NavLink to={to}>{inner}</NavLink>
}

// ─── Space icon ───────────────────────────────────────────────────────────────
function SpaceIcon({ space }) {
  const color = `#${space.color ?? '4C2A92'}`
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer">
      <Link to={`/spaces/${space.id}`} className="flex w-full items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          {space.name.charAt(0)}
        </span>
        <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">{space.name}</span>
        <span className="text-sm text-[var(--text-tertiary)]">→</span>
      </Link>
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────
function EventRow({ event }) {
  const start = new Date(event.start_date)
  const month = start.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase()
  const day = start.getDate()
  const time = event.all_day
    ? 'All day'
    : start.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
  const parts = [event.location, time].filter(Boolean)
  const typeLabel = (event.event_type ?? 'event').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-[var(--border-1)] last:border-0">
      <div className="w-10 shrink-0 text-center">
        <div className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--text-tertiary)]">{month}</div>
        <div className="text-[22px] leading-tight" style={{ fontFamily: FONT_HEADING, fontWeight: 700, color: 'var(--purple-700)' }}>{day}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{event.title}</div>
        {parts.length > 0 && (
          <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{parts.join(' · ')}</div>
        )}
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-[2px] text-[10.5px] font-bold"
        style={{ background: 'var(--accent-teal-tint)', color: 'var(--accent-teal-text)' }}
      >
        {typeLabel}
      </span>
    </div>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-[var(--border-1)] bg-white shadow-[0_1px_3px_rgba(28,22,16,.05)] overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHead({ title, count, countVariant = 'navy', action }) {
  const countStyle = countVariant === 'warn'
    ? { background: 'var(--amber-light)', color: 'var(--amber-hover)' }
    : { background: 'var(--accent-light)', color: 'var(--accent)' }
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-1)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[13.5px]" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-1)' }}>{title}</span>
        {count != null && (
          <span className="rounded-full px-[7px] py-[2px] text-[10.5px] font-bold" style={countStyle}>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

// ─── Home ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { profile, role } = useAuth()
  const [myTasks, setMyTasks] = useState(null)
  const [openTaskCount, setOpenTaskCount] = useState(null)
  const [spaceCount, setSpaceCount] = useState(null)
  const [mySpaces, setMySpaces] = useState([])
  const [activeSprintCount, setActiveSprintCount] = useState(null)
  const [activity, setActivity] = useState(null)
  const [events, setEvents] = useState(null)
  const [eventFilter, setEventFilter] = useState('all')
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)

  // My tasks (with sprint + dept context) — includes space and sprint tasks
  useEffect(() => {
    if (!profile?.id) return

    // Get sprint IDs for which user is a member
    supabase
      .from('sprint_members')
      .select('sprint_id')
      .eq('user_id', profile.id)
      .then(async ({ data: memberships }) => {
        const sprintIds = (memberships ?? []).map(m => m.sprint_id)

        // Get space tasks
        const spacePromise = supabase
          .from('tasks')
          .select('id, title, priority, due_date, department:departments(id, name, color), sprint:sprints(id, name)')
          .eq('assignee_id', profile.id)
          .eq('is_personal', false)
          .is('parent_task_id', null)
          .is('completed_at', null)

        // Get sprint tasks
        const sprintPromise = sprintIds.length > 0
          ? supabase
              .from('tasks')
              .select('id, title, priority, due_date, department:departments(id, name, color), sprint:sprints(id, name)')
              .in('sprint_id', sprintIds)
              .is('parent_task_id', null)
              .is('completed_at', null)
          : Promise.resolve({ data: [] })

        const [{ data: spaceTasks }, { data: sprintTasks }] = await Promise.all([spacePromise, sprintPromise])

        // Merge, deduplicate, and sort
        const all = [...(spaceTasks ?? []), ...(sprintTasks ?? [])]
        const map = new Map()
        for (const task of all) {
          map.set(task.id, task)
        }
        const unique = Array.from(map.values())
        unique.sort((a, b) => {
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity
          return aDate - bDate
        })

        setMyTasks(unique.slice(0, 6))
      })
      .catch(() => setMyTasks([]))
  }, [profile?.id])

  // Org-wide open task count
  useEffect(() => {
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_personal', false)
      .is('parent_task_id', null)
      .is('completed_at', null)
      .then(({ count }) => setOpenTaskCount(count ?? 0))
      .catch(() => setOpenTaskCount(null))
  }, [])

  // Spaces
  function loadSpaces() {
    if (!profile?.id || !role) return
    getMySpaces(profile.id, role, profile.department_id)
      .then(spaces => {
        const active = spaces.filter(s => s.status !== 'archived')
        setSpaceCount(active.length)
        setMySpaces(active)
      })
      .catch(() => setSpaceCount(null))
  }

  useEffect(() => { loadSpaces() }, [profile?.id, profile?.department_id, role])

  // Handle task row click to open task modal
  async function handleTaskClick(task) {
    const fullTask = await getTaskById(task.id)
    setSelectedTask(fullTask)
  }

  // Active sprints
  useEffect(() => {
    if (!profile?.id) return
    getMySprints()
      .then(sprints => setActiveSprintCount(sprints.filter(s => s.status === 'active').length))
      .catch(() => setActiveSprintCount(null))
  }, [profile?.id])

  // Activity log
  useEffect(() => {
    supabase
      .from('activity_log')
      .select('id, action, timestamp')
      .order('timestamp', { ascending: false })
      .limit(6)
      .then(({ data }) => setActivity(data ?? []))
      .catch(() => setActivity([]))
  }, [])

  // Upcoming events
  useEffect(() => {
    getUpcomingEvents(8).then(setEvents).catch(() => setEvents([]))
  }, [])

  const firstSpace = mySpaces[0] ?? null

  // Filter events for "My Dept" — keep events linked to user's spaces
  const mySpaceIds = new Set(mySpaces.map(s => s.id))
  const visibleEvents = eventFilter === 'dept' && events
    ? events.filter(e => e.space_id && mySpaceIds.has(e.space_id))
    : (events ?? [])

  const myTaskCount = myTasks?.length ?? null

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      {/* Header */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[21px] leading-tight" style={{ fontFamily: FONT_HEADING, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
            {greetingForHour()}, {profile?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
            Keep ministry execution visible across departments, meetings, and follow-through.
          </p>
        </div>
        <div
          className="rounded-2xl px-4 py-3 text-right"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-1)', boxShadow: '0 1px 3px rgba(28,22,16,.04)' }}
        >
          <div className="text-[9.5px] uppercase tracking-[.14em]" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-3)' }}>Today</div>
          <div className="mt-0.5 text-[12.5px] font-medium" style={{ fontFamily: FONT_MONO, color: 'var(--ink-1)' }}>
            {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </section>

      {/* KPI row */}
      {/* Same accent mapping as the Dashboard hero cards:
          purple anchor / blue progress / orange priority / green active */}
      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Active Spaces"  value={spaceCount}          subtitle="across the org"         bg="var(--purple-700)" delay={40} />
        <KpiTile label="Open Tasks"     value={openTaskCount}        subtitle="in progress &amp; queued" bg="var(--accent-blue)" delay={90} />
        <KpiTile label="My Tasks Due"   value={myTaskCount}          subtitle="assigned to you"        bg="var(--accent-orange)" delay={140} />
        <KpiTile label="Active Sprints" value={activeSprintCount}    subtitle="running now"            bg="var(--accent-green)" delay={190} />
      </section>

      {/* Two-column body */}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">

        {/* Left column */}
        <div className="space-y-5">

          {/* My Open Tasks */}
          <Card>
            <CardHead
              title="My Open Tasks"
              count={myTaskCount}
              countVariant="navy"
              action={
                <NavLink to="/my-tasks" className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>
                  View all →
                </NavLink>
              }
            />
            {myTasks === null ? (
              <div className="px-4 py-6 text-sm text-[var(--text-tertiary)]">Loading…</div>
            ) : myTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">No open tasks assigned to you.</div>
            ) : (
              <div>
                {myTasks.map(t => <TaskRow key={t.id} task={t} onClick={() => handleTaskClick(t)} />)}
              </div>
            )}
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHead title="Recent Activity" />
            {activity === null ? (
              <div className="px-4 py-6 text-sm text-[var(--text-tertiary)]">Loading…</div>
            ) : activity.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">No recent activity.</div>
            ) : (
              <div>
                {activity.map(e => <ActivityRow key={e.id} entry={e} />)}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <Card>
            <CardHead title="Quick Actions" />
            <QuickRow icon={<SquareCheckBig size={15} />} label="Open my tasks" to="/my-tasks" />
            <QuickRow icon={<Gem size={15} />} label="View all sprints" to="/sprints" />
            {(role === 'super_admin' || role === 'dept_lead') && (
              <div
                className="flex cursor-pointer items-center gap-3 border-b border-[var(--border-1)] px-4 py-3 transition-colors last:border-0 hover:bg-[var(--surface-secondary)]"
                onClick={() => setShowSprintModal(true)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)' }}>
                  <Gem size={15} style={{ color: 'var(--accent)' }} />
                </div>
                <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">New Sprint</span>
                <span className="text-sm text-[var(--text-tertiary)]">→</span>
              </div>
            )}
            {firstSpace ? (
              <SpaceIcon space={firstSpace} />
            ) : (
              <QuickRow icon="S" label="All spaces" to="/spaces" />
            )}
            {(role === 'super_admin' || role === 'dept_lead') && (
              <>
                <div
                  className="flex cursor-pointer items-center gap-3 border-b border-[var(--border-1)] px-4 py-3 transition-colors last:border-0 hover:bg-[var(--surface-secondary)]"
                  onClick={() => setShowSpaceModal(true)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)' }}>
                    <Plus size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <span className="flex-1 text-[12.5px] font-medium text-[var(--text-primary)]">New Space</span>
                  <span className="text-sm text-[var(--text-tertiary)]">→</span>
                </div>
                <QuickRow icon={<MailPlus size={15} />} label="Manage invitations" to="/people/invitations" />
              </>
            )}
          </Card>

          {/* Upcoming Events */}
          <Card>
            <div className="flex items-center justify-between border-b border-[var(--border-1)] px-4 py-3">
              <span className="text-[13.5px]" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-1)' }}>Upcoming Events</span>
              <div className="flex gap-1">
                {['all', 'dept'].map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setEventFilter(f)}
                    className="rounded-full px-3 py-1 text-[11px] font-bold transition-colors"
                    style={eventFilter === f
                      ? { background: 'var(--accent)', color: '#fff' }
                      : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }
                    }
                  >
                    {f === 'all' ? 'All' : 'My Dept'}
                  </button>
                ))}
              </div>
            </div>
            {profile?.department && (
              <div className="border-b border-[var(--border-1)] px-4 py-2 text-[11px] text-[var(--text-tertiary)]">
                {eventFilter === 'dept'
                  ? `Your department (${profile.department.name}) only`
                  : 'All upcoming ministry events'}
              </div>
            )}
            {events === null ? (
              <div className="px-4 py-6 text-sm text-[var(--text-tertiary)]">Loading…</div>
            ) : visibleEvents.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">No upcoming events.</div>
            ) : (
              <div>
                {visibleEvents.slice(0, 4).map(e => <EventRow key={e.id} event={e} />)}
              </div>
            )}
            {visibleEvents.length > 4 && (
              <div className="border-t border-[var(--border-1)] px-4 py-2.5">
                <NavLink to="/calendar" className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>
                  View all events →
                </NavLink>
              </div>
            )}
          </Card>

        </div>
      </div>

      {showSpaceModal && (
        <SpaceModal
          onSaved={() => { loadSpaces(); setShowSpaceModal(false) }}
          onClose={() => setShowSpaceModal(false)}
        />
      )}

      {showSprintModal && (
        <SprintModal
          onSaved={() => {
            getMySprints().then(sprints => setActiveSprintCount(sprints.filter(s => s.status === 'active').length)).catch(() => {})
          }}
          onClose={() => setShowSprintModal(false)}
        />
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          departmentId={selectedTask.department_id}
          sprintId={selectedTask.sprint_id}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}
