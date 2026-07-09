import { CSS } from '@dnd-kit/utilities'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { endOfWeek, isBefore, isEqual, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../hooks/useAuth'
import { getUserDashboardPreferences, getRoleDashboardDefaults, upsertDashboardPreferences, deleteDashboardPreferences } from '../features/dashboard/lib/dashboards'
import { supabase } from '../lib/supabase'
import { getMyTasks } from '../features/tasks'
import { getMySpaces } from '../features/spaces'
import { isTaskCompleted } from '../lib/taskStatuses'
import CompletionRateWidget from '../features/dashboard/components/CompletionRateWidget'
import MemberActivityWidget from '../features/dashboard/components/MemberActivityWidget'
import OverdueByMemberWidget from '../features/dashboard/components/OverdueByMemberWidget'
import SprintProgressWidget from '../features/dashboard/components/SprintProgressWidget'
import UpcomingEventsWidget from '../features/dashboard/components/UpcomingEventsWidget'
import UpcomingMeetingsWidget from '../features/dashboard/components/UpcomingMeetingsWidget'
import AttendanceSummaryWidget from '../features/dashboard/components/AttendanceSummaryWidget'
import ActivityFeedWidget from '../features/dashboard/components/ActivityFeedWidget'
import OrgReportExport from '../features/dashboard/components/OrgReportExport'
import ActionItemsWidget from '../features/dashboard/components/ActionItemsWidget'
import TeamWorkloadWidget from '../features/dashboard/components/TeamWorkloadWidget'
import PastoralMembersWidget from '../features/dashboard/components/PastoralMembersWidget'
import AbsentMembersWidget from '../features/dashboard/components/AbsentMembersWidget'
import TeamActivityHeatmap from '../features/dashboard/components/TeamActivityHeatmap'
import TeamVelocityWidget from '../features/dashboard/components/TeamVelocityWidget'
import PersonalRemindersWidget from '../features/dashboard/components/PersonalRemindersWidget'
import TeamAvailabilityWidget from '../features/dashboard/components/TeamAvailabilityWidget'
import ChartWidget from '../features/dashboard/components/ChartWidget'
import CalculationWidget from '../features/dashboard/components/CalculationWidget'
import GoalsWidget from '../features/dashboard/components/GoalsWidget'
import EmbedWidget from '../features/dashboard/components/EmbedWidget'
import { RegionalUpdateWidget } from '../features/regional-updates/components/RegionalUpdateWidget'
import { getDashboardPresets } from '../features/dashboard/lib/dashboard-queries'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

const heroEnter = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 32 } },
}

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ─── Custom stat card ─────────────────────────────────────────────────────────

const CUSTOM_STAT_OPTIONS = [
  {
    key: 'meetings_this_week',
    label: 'Meetings This Week',
    sub: 'scheduled this week',
    bg: 'var(--purple-700)',
    blobColor: 'rgba(255,255,255,.13)',
    path: '/meetings',
  },
  {
    key: 'completed_this_week',
    label: 'Completed This Week',
    sub: 'tasks finished this week',
    bg: 'var(--purple-700)',
    blobColor: 'rgba(255,255,255,.13)',
    path: '/my-tasks',
  },
  {
    key: 'unread_notifications',
    label: 'Notifications',
    sub: 'unread',
    bg: 'var(--purple-700)',
    blobColor: 'rgba(255,255,255,.13)',
    path: '/notifications',
  },
]

const CUSTOM_STAT_KEY = 'dashboard_custom_stat_v1'

function useCustomStat(userId, unreadCount, serverStats) {
  const [statKey, setStatKey] = useState(() => localStorage.getItem(CUSTOM_STAT_KEY) ?? 'meetings_this_week')
  const [value, setValue] = useState(null)

  function choose(key) {
    setStatKey(key)
    localStorage.setItem(CUSTOM_STAT_KEY, key)
  }

  useEffect(() => {
    if (!userId) return
    let active = true
    setValue(null)

    if (statKey === 'unread_notifications') {
      setValue(unreadCount ?? 0)
      return
    }

    // Served by the consolidated get_dashboard_data RPC (BLW-02)
    if (serverStats && statKey in serverStats) {
      setValue(serverStats[statKey] ?? 0)
      return
    }

    async function load() {
      if (statKey === 'meetings_this_week') {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
        const { count } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true })
          .gte('date', weekStart)
          .lte('date', weekEnd)
        if (active) setValue(count ?? 0)
      } else if (statKey === 'completed_this_week') {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
        const { count } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .gte('completed_at', weekStart)
          .not('completed_at', 'is', null)
        if (active) setValue(count ?? 0)
      }
    }

    load()
    return () => { active = false }
  }, [statKey, userId, unreadCount, serverStats])

  const meta = CUSTOM_STAT_OPTIONS.find((o) => o.key === statKey) ?? CUSTOM_STAT_OPTIONS[0]
  return { meta, value, statKey, choose }
}

function CustomHeroStatCard({ meta, value, statKey, onChoose, onClick }) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        type="button"
        onClick={onClick}
        variants={heroEnter}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: meta.bg,
          borderRadius: 24,
          padding: '28px 28px 24px',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'filter .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.07)' }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
      >
        <span style={{
          position: 'absolute',
          top: -28,
          right: -28,
          width: 130,
          height: 130,
          borderRadius: '50%',
          background: meta.blobColor,
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ fontFamily: FONT_HEADING, fontSize: 10.5, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.78)' }}>
            {meta.label}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v) }}
            title="Change stat"
            style={{
              border: 'none',
              background: 'rgba(255,255,255,.18)',
              borderRadius: 6,
              color: 'rgba(255,255,255,.85)',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              cursor: 'pointer',
              letterSpacing: '.04em',
              lineHeight: 1.6,
              transition: 'background .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.28)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.18)' }}
          >
            change
          </button>
        </div>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 64, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', marginTop: 10 }}>
          {value ?? '—'}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 8, fontWeight: 500, position: 'relative' }}>
          {meta.sub}
        </div>
      </motion.button>

      {showPicker && (
        <>
          <div
            onClick={() => setShowPicker(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 100,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-1)',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(28,22,16,.12)',
            padding: 8,
            minWidth: 220,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.1em', textTransform: 'uppercase', padding: '4px 8px 8px' }}>
              Choose stat
            </div>
            {CUSTOM_STAT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => { onChoose(opt.key); setShowPicker(false) }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: opt.key === statKey ? 'var(--purple-tint)' : 'transparent',
                  color: opt.key === statKey ? 'var(--purple-700)' : 'var(--ink-1)',
                  fontSize: 13,
                  fontWeight: opt.key === statKey ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => { if (opt.key !== statKey) e.currentTarget.style.background = 'var(--surface-sub)' }}
                onMouseLeave={(e) => { if (opt.key !== statKey) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Org stats ───────────────────────────────────────────────────────────────

function useOrgStats(userId, heroStats) {
  const [stats, setStats] = useState({ spaces: null, openTasks: null, myDue: null, activeSprints: null })

  useEffect(() => {
    if (!userId) return
    let active = true

    // Served by the consolidated get_dashboard_data RPC (BLW-02); the legacy
    // get_dashboard_stats call below remains as a fallback.
    if (heroStats) {
      setStats({
        spaces: heroStats.space_count ?? 0,
        openTasks: heroStats.open_task_count ?? 0,
        myDue: heroStats.my_due_task_count ?? 0,
        activeSprints: heroStats.active_sprint_count ?? 0,
      })
      return
    }

    async function load() {
      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_user_id: userId })
      if (!active) return

      if (error) {
        console.error('Failed to load dashboard stats:', error)
        return
      }

      if (data && data.length > 0) {
        const row = data[0]
        setStats({
          spaces: row.space_count ?? 0,
          openTasks: row.open_task_count ?? 0,
          myDue: row.my_due_task_count ?? 0,
          activeSprints: row.active_sprint_count ?? 0,
        })
      }
    }

    load()
    return () => { active = false }
  }, [userId, heroStats])

  return stats
}

function HeroStatCard({ label, value, sub, bg, blobColor, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={heroEnter}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: bg,
        borderRadius: 24,
        padding: '28px 28px 24px',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        width: '100%',
        transition: 'filter .15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.filter = 'brightness(1.07)' }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
    >
      {/* decorative blob */}
      <span style={{
        position: 'absolute',
        top: -28,
        right: -28,
        width: 130,
        height: 130,
        borderRadius: '50%',
        background: blobColor,
        pointerEvents: 'none',
      }} />
      <div style={{ fontFamily: FONT_HEADING, fontSize: 10.5, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.78)', marginBottom: 10, position: 'relative' }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT_HEADING, fontSize: 64, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', position: 'relative' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 8, fontWeight: 500, position: 'relative' }}>
        {sub}
      </div>
    </motion.button>
  )
}

// ─── Inline widgets ───────────────────────────────────────────────────────────

function MyTasksSummaryWidget({ userId, data }) {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ today: null, overdue: null, thisWeek: null })

  useEffect(() => {
    if (!userId) return
    let active = true

    // Served by the consolidated get_dashboard_data RPC (BLW-02)
    if (data) {
      setCounts({
        today: data.today ?? 0,
        overdue: data.overdue ?? 0,
        thisWeek: data.this_week ?? 0,
      })
      return
    }

    getMyTasks(userId)
      .then((tasks) => {
        if (!active) return
        const today = startOfDay(new Date())
        const weekEnd = startOfDay(endOfWeek(today, { weekStartsOn: 1 }))
        let todayCount = 0
        let overdueCount = 0
        let thisWeekCount = 0

        for (const task of tasks) {
          if (isTaskCompleted(task)) continue
          const due = task.due_date ? startOfDay(parseISO(`${task.due_date}T00:00:00`)) : null
          if (!due) continue
          if (isEqual(due, today)) todayCount++
          else if (isBefore(due, today)) overdueCount++
          else if (!isBefore(weekEnd, due)) thisWeekCount++
        }

        setCounts({ today: todayCount, overdue: overdueCount, thisWeek: thisWeekCount })
      })
      .catch(() => {})

    return () => { active = false }
  }, [userId, data])

  const stats = [
    { label: 'Today', value: counts.today, color: 'var(--purple-700)' },
    { label: 'Overdue', value: counts.overdue, color: 'var(--accent-red)' },
    { label: 'This Week', value: counts.thisWeek, color: 'var(--accent-green)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {stats.map((stat) => (
        <button
          key={stat.label}
          type="button"
          onClick={() => navigate('/my-tasks')}
          style={{
            background: 'var(--surface-sub)',
            border: '1px solid var(--border-1)',
            borderRadius: 12,
            padding: '14px 8px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--purple-500)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
        >
          <div style={{ fontFamily: FONT_HEADING, fontSize: 28, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
            {stat.value ?? '—'}
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {stat.label}
          </div>
        </button>
      ))}
    </div>
  )
}

function QuickActionsWidget({ role }) {
  const navigate = useNavigate()

  if (role !== 'super_admin' && role !== 'dept_lead') {
    return (
      <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>
        Quick actions are available to admins and leads.
      </div>
    )
  }

  const actions = [
    { label: '+ New Task', path: '/my-tasks?new=true' },
    { label: '+ New Event', path: '/calendar?new=true' },
    { label: '+ New Sprint', path: '/sprints?new=true' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => navigate(action.path)}
          style={{
            background: 'var(--surface-sub)',
            border: '1px solid var(--border-1)',
            borderRadius: 10,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--purple-700)',
            cursor: 'pointer',
            transition: 'background .12s, border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-tint)'; e.currentTarget.style.borderColor = 'var(--purple-500)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-sub)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

// ─── Home-merge coverage widgets ──────────────────────────────────────────────

function MySpacesWidget({ userId, role, departmentId }) {
  const navigate = useNavigate()
  const [spaces, setSpaces] = useState(null)

  useEffect(() => {
    if (!userId || !role) return
    let active = true
    getMySpaces(userId, role, departmentId)
      .then((rows) => { if (active) setSpaces(rows.slice(0, 6)) })
      .catch(() => { if (active) setSpaces([]) })
    return () => { active = false }
  }, [userId, role, departmentId])

  if (spaces === null) {
    return <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>Loading…</div>
  }
  if (spaces.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>No spaces you belong to yet.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {spaces.map((space) => {
        const color = `#${space.color ?? '4C2A92'}`
        return (
          <button
            key={space.id}
            type="button"
            onClick={() => navigate(`/spaces/${space.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sub)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 8,
                background: color,
                color: 'white',
                fontFamily: FONT_HEADING,
                fontSize: 11.5,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(space.name ?? '?').charAt(0).toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {space.name}
            </span>
            <ChevronRight size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
          </button>
        )
      })}
    </div>
  )
}

// ─── Widget registry ──────────────────────────────────────────────────────────

const WIDGET_META = {
  regional_updates:       { title: 'Regional Updates',          Component: RegionalUpdateWidget },
  my_tasks_summary:       { title: 'My Tasks Summary',          Component: MyTasksSummaryWidget },
  upcoming_events:        { title: 'Upcoming Events',           Component: UpcomingEventsWidget },
  upcoming_meetings:      { title: 'Upcoming Meetings',         Component: UpcomingMeetingsWidget },
  sprint_progress:        { title: 'Sprint Progress',           Component: SprintProgressWidget },
  overdue_by_member:      { title: 'Overdue Tasks by Member',   Component: OverdueByMemberWidget },
  member_activity:        { title: 'Member Activity',           Component: MemberActivityWidget },
  completion_rate:        { title: 'Completion Rate This Week', Component: CompletionRateWidget },
  attendance_summary:     { title: 'Attendance Summary',        Component: AttendanceSummaryWidget },
  activity_feed:          { title: 'Recent Activity',           Component: ActivityFeedWidget },
  action_items:           { title: 'My Action Items',           Component: ActionItemsWidget },
  team_workload:          { title: 'Team Workload',             Component: TeamWorkloadWidget },
  pastoral_members:       { title: 'Pastoral Members',          Component: PastoralMembersWidget },
  absent_members_alert:   { title: 'Absent Members Alert',      Component: AbsentMembersWidget },
  team_activity_heatmap:  { title: 'Team Activity Heatmap',     Component: TeamActivityHeatmap },
  team_velocity:          { title: 'Team Velocity Trend',       Component: TeamVelocityWidget },
  quick_actions:          { title: 'Quick Actions',             Component: QuickActionsWidget },
  my_spaces:              { title: 'My Spaces',                 Component: MySpacesWidget },
  personal_reminders:     { title: 'Personal Reminders',        Component: PersonalRemindersWidget },
  team_availability:      { title: 'Team Availability',         Component: TeamAvailabilityWidget },
  chart_widget:           { title: 'Chart',                     Component: ChartWidget, configurable: true },
  calculation_widget:     { title: 'Calculation',                Component: CalculationWidget, configurable: true },
  goals:                  { title: 'Goals & OKRs',              Component: GoalsWidget },
  embed:                  { title: 'Embed Content',            Component: EmbedWidget },
}

const ALL_WIDGET_KEYS = Object.keys(WIDGET_META)

const FALLBACK_PREFS = ALL_WIDGET_KEYS.map((key, i) => ({
  widget_key: key,
  visible: true,
  sort_order: i + 1,
  config: {},
}))

function mergeWithAllKeys(rows) {
  const map = new Map(rows.map((r) => [r.widget_key, r]))
  const maxOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order ?? 0)) : 0
  return ALL_WIDGET_KEYS.map((key, i) =>
    map.has(key) ? map.get(key) : { widget_key: key, visible: false, sort_order: maxOrder + i + 1, config: {} },
  )
}

// ─── Widget card ──────────────────────────────────────────────────────────────

function WidgetCard({ widgetKey, role, userId, departmentId, config, onConfigChange, onUnpin, data }) {
  const meta = WIDGET_META[widgetKey]
  if (!meta) return null
  const { title, Component, configurable } = meta

  return (
    <motion.div
      variants={heroEnter}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 20,
        boxShadow: '0 1px 4px rgba(28,22,16,.04)',
        padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: FONT_HEADING, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)' }}>{title}</span>
        <button
          type="button"
          onClick={() => onUnpin(widgetKey)}
          title={`Unpin ${title}`}
          aria-label={`Unpin ${title}`}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: 'var(--ink-3)',
            padding: '2px 4px',
            lineHeight: 1,
            borderRadius: 6,
            transition: 'color .12s, background .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; e.currentTarget.style.background = 'var(--accent-red-tint)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-3)'; e.currentTarget.style.background = 'none' }}
        >
          ✕
        </button>
      </div>
      {configurable ? (
        <Component config={config} onConfigChange={onConfigChange} />
      ) : (
        <Component role={role} userId={userId} departmentId={departmentId} data={data} />
      )}
    </motion.div>
  )
}

// ─── Customize panel ──────────────────────────────────────────────────────────

function SortableWidgetRow({ item, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.widget_key,
  })
  const title = WIDGET_META[item.widget_key]?.title ?? item.widget_key

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        boxShadow: isDragging ? '0 6px 18px rgba(28,22,16,.12)' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--surface-sub)',
        border: `1px solid ${isDragging ? 'var(--purple-500)' : 'var(--border-1)'}`,
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${title}`}
        style={{
          border: 'none',
          background: 'none',
          cursor: 'grab',
          color: '#C8BFB2',
          fontSize: 15,
          padding: '0 2px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ⋮⋮
      </button>

      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{title}</span>

      <button
        type="button"
        role="switch"
        aria-checked={item.visible}
        onClick={() => onToggle(item.widget_key)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          border: 'none',
          background: item.visible ? 'var(--purple-700)' : 'var(--border-2)',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          padding: 0,
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: 3,
            left: item.visible ? 19 : 3,
            transition: 'left .15s',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      </button>
    </div>
  )
}

function CustomizePanel({ prefs, onClose, onSave, onReset }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [draft, setDraft] = useState(() => [...prefs].sort((a, b) => a.sort_order - b.sort_order))
  const [saving, setSaving] = useState(false)

  function handleToggle(key) {
    setDraft((current) =>
      current.map((item) => (item.widget_key === key ? { ...item, visible: !item.visible } : item)),
    )
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = draft.findIndex((item) => item.widget_key === active.id)
    const newIndex = draft.findIndex((item) => item.widget_key === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setDraft((current) => arrayMove(current, oldIndex, newIndex))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const resequenced = draft.map((item, i) => ({ ...item, sort_order: i + 1 }))
      await onSave(resequenced)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,30,.25)', zIndex: 40 }}
      />
      <motion.div
        initial={{ x: 340 }}
        animate={{ x: 0, transition: { type: 'spring', stiffness: 380, damping: 36 } }}
        exit={{ x: 340, transition: { duration: 0.18 } }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: 'var(--surface-card)',
          boxShadow: '-4px 0 24px rgba(28,22,16,.10)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_BODY,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-1)' }}>
          <span style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>Customize Dashboard</span>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--ink-3)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '10px 20px 4px', fontSize: 12, color: 'var(--ink-3)' }}>
          Toggle widgets on/off and drag to reorder.
        </p>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draft.map((item) => item.widget_key)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.map((item) => (
                  <SortableWidgetRow key={item.widget_key} item={item} onToggle={handleToggle} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              background: 'var(--purple-700)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.65 : 1,
              transition: 'background .13s',
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = 'var(--purple-600)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--purple-700)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{
              width: '100%',
              background: 'var(--surface-card)',
              color: 'var(--ink-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'border-color .13s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
          >
            Reset to defaults
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, role } = useAuth()
  const { unreadCount } = useNotifications()
  const { showToast } = useToast()
  const location = useLocation()
  const dashboardData = useDashboardData(profile?.id, role, profile?.department_id)
  const orgStats = useOrgStats(profile?.id, dashboardData?.hero)
  const navigate = useNavigate()
  const customStat = useCustomStat(profile?.id, unreadCount, dashboardData?.custom_stats)
  const [prefs, setPrefs] = useState([])
  const [loadingPrefs, setLoadingPrefs] = useState(true)
  const [showCustomize, setShowCustomize] = useState(false)

  useEffect(() => {
    if (!profile?.id || !role) return
    let active = true

    async function loadPrefs() {
      setLoadingPrefs(true)
      try {
        const userPrefs = await getUserDashboardPreferences(profile.id)

        if (!active) return

        if (userPrefs && userPrefs.length > 0) {
          setPrefs(mergeWithAllKeys(userPrefs))
          return
        }

        // Load role-based presets
        const rolePreset = await getDashboardPresets(role)
        const defaultWidgets = rolePreset.widgets || []

        if (!active) return

        // Convert preset widget IDs to preference objects
        const defaultPrefs = defaultWidgets.map((key, i) => ({
          widget_key: key,
          visible: true,
          sort_order: i + 1,
        }))

        setPrefs(mergeWithAllKeys(defaultPrefs))
      } catch {
        if (active) setPrefs(FALLBACK_PREFS)
      } finally {
        if (active) setLoadingPrefs(false)
      }
    }

    loadPrefs()
    return () => { active = false }
  }, [profile?.id, role])

  const visibleWidgets = useMemo(
    () => [...prefs].filter((p) => p.visible).sort((a, b) => a.sort_order - b.sort_order),
    [prefs],
  )

  async function handleUnpin(widgetKey) {
    const previous = prefs
    setPrefs((current) =>
      current.map((p) => (p.widget_key === widgetKey ? { ...p, visible: false } : p)),
    )
    if (!profile?.id) return
    const existing = prefs.find((p) => p.widget_key === widgetKey)
    try {
      await upsertDashboardPreferences(profile.id, [{ widget_key: widgetKey, visible: false, sort_order: existing?.sort_order ?? 999 }])
    } catch {
      setPrefs(previous)
      showToast("Couldn't unpin that widget. Try again.", { tone: 'error' })
    }
  }

  async function handleConfigChange(widgetKey, config) {
    setPrefs((current) =>
      current.map((p) => (p.widget_key === widgetKey ? { ...p, config } : p)),
    )
    if (!profile?.id) return
    const existing = prefs.find((p) => p.widget_key === widgetKey)
    await upsertDashboardPreferences(profile.id, [{
      widget_key: widgetKey,
      visible: existing?.visible ?? true,
      sort_order: existing?.sort_order ?? 999,
      config,
    }])
  }

  async function handleSavePrefs(nextPrefs) {
    setPrefs(nextPrefs)
    if (!profile?.id) return
    await upsertDashboardPreferences(profile.id, nextPrefs)
  }

  async function handleReset() {
    if (!profile?.id) return
    await deleteDashboardPreferences(profile.id)
    const roleDefaults = await getRoleDashboardDefaults(role)
    setPrefs(mergeWithAllKeys(roleDefaults ?? []))
    setShowCustomize(false)
  }

  if (loadingPrefs) {
    return (
      <div className="space-y-4 pb-20">
        <div className="h-16 animate-pulse rounded-[14px] bg-[var(--surface-secondary)]" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-[20px] bg-[var(--surface-secondary)]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {location.state?.authError ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--amber)', background: 'var(--amber-light)', color: 'var(--amber-hover)' }}
        >
          {location.state.authError}
        </div>
      ) : null}

      <div className="space-y-5 pb-20" style={{ fontFamily: FONT_BODY }}>
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: FONT_HEADING, fontSize: 26, fontWeight: 700, color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.02em' }}>
              {greetingForHour()}, {profile?.name?.split(' ')[0] ?? 'there'} 👋
            </h1>
            <p style={{ marginTop: 5, fontSize: 13, color: 'var(--ink-2)', margin: '5px 0 0' }}>
              Keep ministry execution visible across departments, meetings, and follow-through.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <OrgReportExport role={role} />
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-1)',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--purple-700)',
                cursor: 'pointer',
                transition: 'border-color .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--purple-500)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
            >
              Customize Dashboard
            </button>
          </div>
        </section>

        {/* ── Hero stat cards — semantic accent mapping: purple anchor /
            blue progress / orange priority / green active ── */}
        <motion.div
          variants={heroStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
        >
          <CustomHeroStatCard
            meta={customStat.meta}
            value={customStat.value}
            statKey={customStat.statKey}
            onChoose={customStat.choose}
            onClick={() => navigate(customStat.meta.path)}
          />
          <HeroStatCard
            label="Open Tasks"
            value={orgStats.openTasks}
            sub="in progress & queued"
            bg="var(--accent-blue)"
            blobColor="rgba(255,255,255,.10)"
            onClick={() => navigate('/my-tasks')}
          />
          <HeroStatCard
            label="My Tasks Due"
            value={orgStats.myDue}
            sub="assigned to you"
            bg="var(--accent-orange)"
            blobColor="rgba(255,255,255,.15)"
            onClick={() => navigate('/my-tasks')}
          />
          <HeroStatCard
            label="Active Sprints"
            value={orgStats.activeSprints}
            sub="running now"
            bg="var(--accent-green)"
            blobColor="rgba(255,255,255,.15)"
            onClick={() => navigate('/sprints')}
          />
        </motion.div>

        {visibleWidgets.length === 0 ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              color: 'var(--ink-2)',
              fontSize: 13,
              border: '1px dashed var(--border-2)',
              borderRadius: 20,
              background: 'var(--surface-card)',
            }}
          >
            No widgets pinned.{' '}
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              style={{ color: 'var(--purple-700)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}
            >
              Customize Dashboard
            </button>{' '}
            to add some.
          </div>
        ) : (
          <motion.div variants={heroStagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
            {visibleWidgets.map((pref) => (
              <WidgetCard
                key={pref.widget_key}
                widgetKey={pref.widget_key}
                role={role}
                userId={profile?.id}
                departmentId={profile?.department_id}
                config={pref.config}
                onConfigChange={(config) => handleConfigChange(pref.widget_key, config)}
                onUnpin={handleUnpin}
                data={dashboardData?.[pref.widget_key]}
              />
            ))}
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════ */}
        {/* FLOCK CRM SECTION — REGIONAL SECRETARY ONLY                  */}
        {/* ════════════════════════════════════════════════════════════ */}
      </div>

      <AnimatePresence>
        {showCustomize ? (
          <CustomizePanel
            key="customize-panel"
            prefs={prefs}
            onClose={() => setShowCustomize(false)}
            onSave={handleSavePrefs}
            onReset={handleReset}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
