import { Activity, ArrowUpRight, CalendarDays, Sparkles, Users2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Badge from '../components/ui/Badge'
import { useNotifications } from '../context/NotificationsContext'
import { useAuth } from '../hooks/useAuth'
import { getUpcomingEvents } from '../lib/calendar'
import { listInvitations, listPastorMembers, listUsers } from '../lib/people/api'
import { selectUserLifecycleStats } from '../lib/people/selectors'
import { getMySpaces } from '../lib/spaces'
import { getMySprints } from '../lib/sprints'
import { supabase } from '../lib/supabase'

function greetingForHour() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function buildQuickActions(role, deptSlug, sprintCount) {
  const spacesLink = { label: 'My spaces', to: '/spaces' }
  const sprintLink = sprintCount > 0 ? { label: role === 'super_admin' ? 'All sprints' : role === 'pastor' ? 'View sprints' : 'My sprints', to: '/sprints' } : null

  if (role === 'pastor') {
    return [
      { label: 'View my flock', to: '/flock' },
      ...(sprintLink ? [sprintLink] : []),
      { label: 'Review meetings', to: '/meetings' },
      spacesLink,
    ]
  }
  if (role === 'member') {
    return [
      { label: 'Open my tasks', to: '/my-tasks' },
      ...(sprintLink ? [sprintLink] : []),
      spacesLink,
      { label: 'Review meetings', to: '/meetings' },
    ]
  }
  if (role === 'dept_lead') {
    return [
      spacesLink,
      { label: 'My sprints', to: '/sprints' },
      { label: 'Manage invitations', to: '/people/invitations' },
      { label: 'Open automations', to: '/automations' },
    ]
  }

  return [
    { label: 'All sprints', to: '/sprints' },
    { label: 'People workspace', to: '/people/users' },
    { label: 'Manage invitations', to: '/people/invitations' },
    { label: 'Open automations', to: '/automations' },
  ]
}

function StatCard({ label, value, accent, tint, to }) {
  const content = (
    <div
      className="rounded-[22px] p-5"
      style={{
        background: tint ?? 'var(--surface)',
        boxShadow: 'var(--card-shadow)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent)',
      }}
    >
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{value}</div>
        <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accent}`}>Live</div>
      </div>
    </div>
  )

  if (!to) return content

  return (
    <NavLink to={to} className="block">
      {content}
    </NavLink>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {title}
      </div>
      <div>{subtitle}</div>
    </div>
  )
}

export default function Dashboard() {
  const { profile, role } = useAuth()
  const { unreadCount } = useNotifications()
  const location = useLocation()
  const [deptSlug, setDeptSlug] = useState(null)
  const [lifecycleStats, setLifecycleStats] = useState(null)
  const [mySprintCount, setMySprintCount] = useState(null)
  const [spaceCount, setSpaceCount] = useState(null)
  const [meetingsThisWeek, setMeetingsThisWeek] = useState(null)
  const [upcomingEvents, setUpcomingEvents] = useState(null)
  const [recentActivity, setRecentActivity] = useState(null)

  useEffect(() => {
    if (!profile?.department_id) return

    supabase
      .from('departments')
      .select('name')
      .eq('id', profile.department_id)
      .single()
      .then(({ data }) => {
        if (data?.name) setDeptSlug(data.name.toLowerCase())
      })
  }, [profile?.department_id])

  useEffect(() => {
    if (!profile?.id) {
      setMySprintCount(null)
      return
    }

    getMySprints()
      .then((sprints) => {
        setMySprintCount(sprints.filter((sprint) => sprint.status === 'active').length)
      })
      .catch(() => setMySprintCount(null))
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id || !role) {
      setSpaceCount(null)
      return
    }

    getMySpaces(profile.id, role, profile.department_id)
      .then((spaces) => setSpaceCount(spaces.filter((space) => space.status === 'active').length))
      .catch(() => setSpaceCount(null))
  }, [profile?.department_id, profile?.id, role])

  useEffect(() => {
    getUpcomingEvents(5).then(setUpcomingEvents).catch(() => setUpcomingEvents([]))
  }, [])

  useEffect(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)

    supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gte('date', start.toISOString())
      .lt('date', end.toISOString())
      .then(({ count, error }) => setMeetingsThisWeek(error ? null : (count ?? 0)))
      .catch(() => setMeetingsThisWeek(null))
  }, [])

  useEffect(() => {
    supabase
      .from('activity_log')
      .select('id, action, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => setRecentActivity(error ? [] : (data ?? [])))
      .catch(() => setRecentActivity([]))
  }, [])

  useEffect(() => {
    if (!profile?.id || role === 'member') {
      setLifecycleStats(null)
      return
    }

    Promise.all([listUsers(), listInvitations(), listPastorMembers()])
      .then(([users, invitations, pastorMembers]) => {
        setLifecycleStats(
          selectUserLifecycleStats({
            users,
            invitations,
            pastorMembers,
            role,
            profile,
          }),
        )
      })
      .catch(() => {
        setLifecycleStats(null)
      })
  }, [profile, role])

  const quickActions = buildQuickActions(role, deptSlug, mySprintCount ?? 0)
  const overviewStats = useMemo(
    () => [
      { label: 'Active spaces', value: spaceCount ?? '—', accent: 'bg-blue-100 text-blue-700', tint: 'rgba(59,130,246,0.08)', to: '/spaces' },
      { label: 'Meetings this week', value: meetingsThisWeek ?? '—', accent: 'bg-teal-100 text-teal-700', tint: 'rgba(20,184,166,0.08)' },
      { label: 'Active Sprints', value: mySprintCount ?? '—', accent: 'bg-orange-100 text-orange-700', tint: 'rgba(249,115,22,0.08)', to: '/sprints' },
      { label: 'Upcoming Events', value: upcomingEvents ? upcomingEvents.length : '—', accent: 'bg-violet-100 text-violet-700', tint: 'rgba(168,85,247,0.08)', to: '/calendar' },
    ],
    [meetingsThisWeek, mySprintCount, spaceCount, upcomingEvents],
  )

  return (
    <div className="space-y-5">
      {location.state?.authError ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {location.state.authError}
        </div>
      ) : null}

      <section className="rounded-[26px] border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              <Sparkles size={12} />
              Workspace Overview
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              {greetingForHour()}, {profile?.name ?? 'there'}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Keep ministry execution visible across departments, meetings, shepherding, and follow-through.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3 text-right"
              style={{ boxShadow: 'var(--card-shadow)' }}
            >
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Today
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              {unreadCount > 0 ? (
                <div className="mt-2 text-xs text-[var(--accent)]">{unreadCount} unread notifications</div>
              ) : null}
            </div>
            <div className="rounded-2xl bg-[linear-gradient(135deg,_#f03f86,_#7b68ee)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(123,104,238,0.24)]">
              {role?.replace('_', ' ')}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewStats.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} accent={item.accent} tint={item.tint} to={item.to} />
        ))}
      </section>

      {role !== 'member' ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active Members"
            value={lifecycleStats?.activeUsers ?? '—'}
            accent="bg-orange-100 text-orange-700"
            tint="rgba(249,115,22,0.08)"
          />
          <StatCard
            label="Pending Invitations"
            value={lifecycleStats?.pendingInvitations ?? '—'}
            accent="bg-violet-100 text-violet-700"
            tint="rgba(168,85,247,0.08)"
          />
          <StatCard
            label="Recently Activated Users"
            value={lifecycleStats?.recentlyActivated ?? '—'}
            accent="bg-blue-100 text-blue-700"
            tint="rgba(59,130,246,0.08)"
          />
          <StatCard
            label="Users Needing Attention"
            value={lifecycleStats?.usersNeedingAttention ?? '—'}
            accent="bg-amber-100 text-amber-700"
            tint="rgba(249,115,22,0.08)"
          />
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.5fr_1.5fr_1.2fr]">
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
              <Activity size={18} className="text-[var(--accent)]" />
              Recent Activity
            </div>
            <button type="button" className="text-sm text-[var(--text-tertiary)]">•••</button>
          </div>
          {recentActivity === null ? (
            <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading...
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-[var(--surface-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  <div className="font-medium text-[var(--text-primary)]">{entry.action.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {new Date(entry.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📊" title="No recent activity" subtitle="Activity will appear here as the team works" />
          )}
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
              <CalendarDays size={18} className="text-[#f03f86]" />
              Calendar
            </div>
            <NavLink to="/calendar" className="text-sm text-[var(--accent)]">
              View full calendar →
            </NavLink>
          </div>
          <div className="space-y-3">
            {upcomingEvents === null ? (
              <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Loading...
              </div>
            ) : null}
            {(upcomingEvents ?? []).slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-2xl bg-[var(--surface-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[var(--text-primary)]">{event.title}</span>
                  <Badge tone={event.event_type === 'deadline' ? 'blocked' : event.event_type === 'prayer' ? 'review' : event.event_type === 'training' ? 'active' : 'completed'}>
                    {event.event_type}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {new Date(event.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  {event.location ? ` · ${event.location}` : ''}
                </div>
              </div>
            ))}
            {upcomingEvents && upcomingEvents.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-tertiary)] px-4 py-6 text-sm text-[var(--text-tertiary)]">
                No upcoming ministry events.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
            <Users2 size={18} className="text-[#ff8a00]" />
            Quick Actions
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <NavLink
                key={action.to}
                to={action.to}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-white hover:text-[var(--text-primary)]"
              >
                <span>{action.label}</span>
                <ArrowUpRight size={15} className="text-[var(--text-tertiary)]" />
              </NavLink>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
