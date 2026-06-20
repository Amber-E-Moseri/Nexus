import { CSS } from '@dnd-kit/utilities'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { endOfWeek, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import { useAuth } from '../hooks/useAuth'
import { getUserDashboardPreferences, getRoleDashboardDefaults, upsertDashboardPreferences, deleteDashboardPreferences } from '../features/dashboard/lib/dashboards'
import { supabase } from '../lib/supabase'
import { getMyTasks } from '../features/tasks'
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
import { getDashboardPresets } from '../features/dashboard/lib/dashboard-queries'

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ─── Inline widgets ───────────────────────────────────────────────────────────

function MyTasksSummaryWidget({ userId }) {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ today: null, overdue: null, thisWeek: null })

  useEffect(() => {
    if (!userId) return
    let active = true

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
  }, [userId])

  const stats = [
    { label: 'Today', value: counts.today, color: '#4C2A92' },
    { label: 'Overdue', value: counts.overdue, color: '#C94830' },
    { label: 'This Week', value: counts.thisWeek, color: '#2D8653' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {stats.map((stat) => (
        <button
          key={stat.label}
          type="button"
          onClick={() => navigate('/my-tasks')}
          style={{
            background: '#FAFAF7',
            border: '1px solid #EDE8DC',
            borderRadius: 12,
            padding: '14px 8px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#EDE8DC' }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, color: stat.color, lineHeight: 1 }}>
            {stat.value ?? '—'}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9E9488', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
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
      <div style={{ fontSize: 13, color: '#B0A696', padding: '8px 0' }}>
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
            background: '#F9F7F3',
            border: '1px solid #EDE8DC',
            borderRadius: 10,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: 13,
            fontWeight: 600,
            color: '#4C2A92',
            cursor: 'pointer',
            transition: 'background .12s, border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#EDE8F8'; e.currentTarget.style.borderColor = '#9B78E8' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F9F7F3'; e.currentTarget.style.borderColor = '#EDE8DC' }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

// ─── Widget registry ──────────────────────────────────────────────────────────

const WIDGET_META = {
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
}

const ALL_WIDGET_KEYS = Object.keys(WIDGET_META)

const FALLBACK_PREFS = ALL_WIDGET_KEYS.map((key, i) => ({
  widget_key: key,
  visible: true,
  sort_order: i + 1,
}))

function mergeWithAllKeys(rows) {
  const map = new Map(rows.map((r) => [r.widget_key, r]))
  const maxOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order ?? 0)) : 0
  return ALL_WIDGET_KEYS.map((key, i) =>
    map.has(key) ? map.get(key) : { widget_key: key, visible: false, sort_order: maxOrder + i + 1 },
  )
}

// ─── Widget card ──────────────────────────────────────────────────────────────

function WidgetCard({ widgetKey, role, userId, departmentId, onUnpin }) {
  const meta = WIDGET_META[widgetKey]
  if (!meta) return null
  const { title, Component } = meta

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E9E4D8',
        borderRadius: 20,
        boxShadow: '0 1px 4px rgba(28,22,16,.05)',
        padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1610' }}>{title}</span>
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
            color: '#C8BFB2',
            padding: '2px 4px',
            lineHeight: 1,
            borderRadius: 6,
            transition: 'color .12s, background .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#C94830'; e.currentTarget.style.background = '#FEF0ED' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#C8BFB2'; e.currentTarget.style.background = 'none' }}
        >
          ✕
        </button>
      </div>
      <Component role={role} userId={userId} departmentId={departmentId} />
    </div>
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
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: '#FAFAF7',
        border: '1px solid #EDE8DC',
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

      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1C1610' }}>{title}</span>

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
          background: item.visible ? '#4C2A92' : '#D1CBC0',
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
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,30,.25)', zIndex: 40 }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: 'white',
          boxShadow: '-4px 0 24px rgba(28,22,16,.10)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #EDE8DC' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1610' }}>Customize Dashboard</span>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 18, color: '#B0A696', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '10px 20px 4px', fontSize: 12, color: '#9E9488' }}>
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

        <div style={{ padding: '14px 20px', borderTop: '1px solid #EDE8DC', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              background: '#4C2A92',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{
              width: '100%',
              background: 'white',
              color: '#6B6560',
              border: '1px solid #EDE8DC',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, role } = useAuth()
  const { unreadCount } = useNotifications()
  const location = useLocation()
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
    setPrefs((current) =>
      current.map((p) => (p.widget_key === widgetKey ? { ...p, visible: false } : p)),
    )
    if (!profile?.id) return
    const existing = prefs.find((p) => p.widget_key === widgetKey)
    await upsertDashboardPreferences(profile.id, [{ widget_key: widgetKey, visible: false, sort_order: existing?.sort_order ?? 999 }])
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

      <div className="space-y-5 pb-20">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 900, color: '#1C1610', margin: 0, letterSpacing: '-0.02em' }}>
              {greetingForHour()}, {profile?.name?.split(' ')[0] ?? 'there'}
            </h1>
            <p style={{ marginTop: 4, fontSize: 12.5, color: '#9E9488', margin: 0 }}>
              {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <OrgReportExport role={role} />
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              style={{
                background: 'white',
                border: '1px solid #EDE8DC',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#4C2A92',
                cursor: 'pointer',
                transition: 'border-color .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4C2A92' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#EDE8DC' }}
            >
              Customize Dashboard
            </button>
          </div>
        </section>

        {visibleWidgets.length === 0 ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              color: '#B0A696',
              fontSize: 13,
              border: '1px dashed #D9D3C7',
              borderRadius: 20,
              background: '#FAFAF7',
            }}
          >
            No widgets pinned.{' '}
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              style={{ color: '#4C2A92', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}
            >
              Customize Dashboard
            </button>{' '}
            to add some.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleWidgets.map((pref) => (
              <WidgetCard
                key={pref.widget_key}
                widgetKey={pref.widget_key}
                role={role}
                userId={profile?.id}
                departmentId={profile?.department_id}
                onUnpin={handleUnpin}
              />
            ))}
          </div>
        )}
      </div>

      {showCustomize ? (
        <CustomizePanel
          prefs={prefs}
          onClose={() => setShowCustomize(false)}
          onSave={handleSavePrefs}
          onReset={handleReset}
        />
      ) : null}
    </>
  )
}
