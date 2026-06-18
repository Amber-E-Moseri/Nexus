import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent } from '../../lib/calendar'
import { advanceSprintStatus, calculateSprintTaskStats, duplicateSprint, getSprintDetail, getSprintTasks, restoreSprint, updateSprint } from '../../lib/sprints'
import { supabase } from '../../lib/supabase'
import { isTaskCompleted } from '../../lib/taskStatuses'
import SprintProgressBar from '../../modules/sprints/SprintProgressBar'
import CalendarView from '../../modules/calendar/CalendarView'
import EventModal from '../../modules/calendar/EventModal'
import SprintMemberPanel from '../../modules/sprints/SprintMemberPanel'
import SprintTaskBoard from '../../modules/sprints/SprintTaskBoard'
import SprintTeamPanel from '../../modules/sprints/SprintTeamPanel'
import SprintReview from './SprintReview'

const TABS = ['Overview', 'Tasks', 'Calendar', 'Teams', 'Members', 'Review']

function ArchivedSprintBanner({ sprint, onRestore, userRole }) {
  const canRestore = userRole === 'super_admin' || userRole === 'dept_lead'

  return (
    <div
      style={{
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#F3F0EB',
        border: '1px solid #EDE8DC',
        borderRadius: 12,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: '#2D2A22' }}>
        📦 This sprint is archived
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onRestore}
          disabled={!canRestore}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            background: canRestore ? 'var(--accent)' : '#E5E0D4',
            color: canRestore ? 'white' : '#9E9488',
            border: 'none',
            cursor: canRestore ? 'pointer' : 'not-allowed',
            opacity: canRestore ? 1 : 0.6,
          }}
        >
          Restore
        </button>
      </div>
    </div>
  )
}
const NEXT_ACTION = {
  planning: { label: 'Start Sprint', next: 'active' },
  active: { label: 'Complete Sprint', next: 'completed' },
  completed: { label: 'Begin Review', next: 'review' },
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-4">
      <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
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

export default function SprintOverview() {
  const { sprintId } = useParams()
  const { role, profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Overview')
  const [detail, setDetail] = useState(null)
  const [tasks, setTasks] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingOverview, setSavingOverview] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [recentActivity, setRecentActivity] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null)
  const [calendarDefaultDate, setCalendarDefaultDate] = useState(null)

  async function loadDetail() {
    setLoading(true)
    try {
      const [nextDetail, nextTasks] = await Promise.all([getSprintDetail(sprintId), getSprintTasks(sprintId)])
      setDetail(nextDetail)
      setTasks(nextTasks)
      setGoalDraft(nextDetail.sprint.goal ?? '')
      setDescriptionDraft(nextDetail.sprint.description ?? '')
    } catch (error) {
      console.error('Failed to load sprint:', error)
      setDetail(null)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [sprintId])

  useEffect(() => {
    setCalendarLoading(true)
    supabase
      .from('calendar_events')
      .select('*')
      .eq('sprint_id', sprintId)
      .order('start_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error
        setCalendarEvents(data ?? [])
      })
      .catch(() => setCalendarEvents([]))
      .finally(() => setCalendarLoading(false))
  }, [sprintId])

  useEffect(() => {
    setRecentActivity(null)
    supabase
      .from('activity_log')
      .select('id, action, created_at')
      .eq('entity_type', 'sprint')
      .eq('entity_id', sprintId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => setRecentActivity(error ? [] : (data ?? [])))
      .catch(() => setRecentActivity([]))
  }, [sprintId])

  const canManage = role === 'super_admin' || detail?.members?.some(
    (member) => member.user?.id === profile?.id && ['owner', 'manager'].includes(member.role),
  )
  const canCreateSprint = role === 'super_admin' || role === 'dept_lead'

  const isArchived = detail?.sprint?.status === 'archived'
  const visibleTabs = detail?.sprint?.status === 'completed' || detail?.sprint?.status === 'review' || detail?.sprint?.status === 'archived'
    ? TABS
    : TABS.filter((tab) => tab !== 'Review')

  const completion = useMemo(() => {
    if (tasks.length === 0) return 0
    const done = tasks.filter((task) => isTaskCompleted(task)).length
    return Math.round((done / tasks.length) * 100)
  }, [tasks])
  const reviewCompleted = Boolean(detail?.review?.reviewed_at ?? detail?.review?.completed_at)

  async function reloadCalendar() {
    setCalendarLoading(true)
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('sprint_id', sprintId)
        .order('start_date', { ascending: true })

      if (error) throw error
      setCalendarEvents(data ?? [])
    } finally {
      setCalendarLoading(false)
    }
  }

  async function handleAdvance() {
    const action = NEXT_ACTION[detail.sprint.status]
    if (!action) return
    await advanceSprintStatus(detail.sprint.id, action.next)
    await loadDetail()
    if (action.next === 'review') {
      setActiveTab('Review')
    }
  }

  async function handleOverviewSave() {
    setSavingOverview(true)
    try {
      await updateSprint(detail.sprint.id, {
        goal: goalDraft.trim() || null,
        description: descriptionDraft.trim() || null,
      })
      await loadDetail()
    } finally {
      setSavingOverview(false)
    }
  }

  async function handleDuplicate() {
    await duplicateSprint(detail.sprint.id, profile.id)
  }

  async function handleRestore() {
    try {
      const result = await restoreSprint(detail.sprint.id, detail.sprint.department_id)
      if (result.error) {
        alert(result.error)
      } else {
        await loadDetail()
      }
    } catch (err) {
      alert('Failed to restore sprint')
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading...</div>
  }

  if (!detail?.sprint) {
    return <div className="rounded-[20px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">Sprint not found.</div>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{detail.sprint.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={detail.sprint.status}>{detail.sprint.status}</Badge>
              <span className="text-sm text-[var(--text-tertiary)]">
                {detail.sprint.start_date || detail.sprint.end_date
                  ? `${detail.sprint.start_date ?? 'No start'} → ${detail.sprint.end_date ?? 'No end'}`
                  : 'No dates set'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {NEXT_ACTION[detail.sprint.status] && canManage && !isArchived ? (
              <button type="button" onClick={handleAdvance} disabled={detail.sprint.status === 'review' && !reviewCompleted} title={detail.sprint.status === 'review' && !reviewCompleted ? 'Complete the sprint review before archiving' : ''} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {NEXT_ACTION[detail.sprint.status].label}
              </button>
            ) : null}
            {canCreateSprint ? (
              <button type="button" onClick={handleDuplicate} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">
                Duplicate
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isArchived && (
        <ArchivedSprintBanner sprint={detail.sprint} onRestore={handleRestore} userRole={role} />
      )}

      <div role="tablist" className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const tabId = tab.toLowerCase().replace(/\s+/g, '-')
          return (
            <button
              key={tab}
              id={`tab-${tabId}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tabId}`}
              onClick={() => setActiveTab(tab)}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{
                borderColor: activeTab === tab ? 'var(--accent)' : 'var(--border)',
                background: activeTab === tab ? 'var(--accent-light)' : 'white',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {activeTab === 'Overview' ? (
        <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview" tabIndex={0} className="space-y-5">
          {tasks.length > 0 && (
            <div className="rounded-[24px] border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
              <SprintProgressBar tasksCount={calculateSprintTaskStats(tasks)} compact={false} />
            </div>
          )}
          <section className="grid gap-4 md:grid-cols-3">
            <Stat label="Members" value={detail.members.length} />
            <Stat label="Tasks" value={tasks.length} />
            <Stat label="Completion" value={`${completion}%`} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
            <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
              <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Sprint Overview</div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Goal</label>
                  <textarea
                    rows={3}
                    value={goalDraft}
                    disabled={!canManage || isArchived}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] disabled:bg-[var(--surface-secondary)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Description</label>
                  <textarea
                    rows={5}
                    value={descriptionDraft}
                    disabled={!canManage || isArchived}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] disabled:bg-[var(--surface-secondary)]"
                  />
                </div>

                {canManage && !isArchived ? (
                  <button
                    type="button"
                    onClick={handleOverviewSave}
                    disabled={savingOverview}
                    className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savingOverview ? 'Saving…' : 'Save Overview'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
              <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Recent Activity</div>
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
          </section>
        </div>
      ) : null}

      {activeTab === 'Tasks' ? (
        <div role="tabpanel" id="tabpanel-tasks" aria-labelledby="tab-tasks" tabIndex={0} className="rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
          <SprintTaskBoard sprintId={detail.sprint.id} canEdit={Boolean(canManage && !isArchived)} />
        </div>
      ) : null}

      {activeTab === 'Calendar' ? (
        <div role="tabpanel" id="tabpanel-calendar" aria-labelledby="tab-calendar" tabIndex={0}>
          <CalendarView
            events={calendarEvents}
            loading={calendarLoading}
            year={calendarYear}
            month={calendarMonth}
            onEventClick={setSelectedCalendarEvent}
            onDayClick={(day) => {
              if (!canManage || isArchived) return
              setCalendarDefaultDate(day)
              setShowEventModal(true)
            }}
            onAddEvent={canManage && !isArchived ? () => setShowEventModal(true) : undefined}
            onEditEvent={(event) => {
              setSelectedCalendarEvent(event)
              setShowEventModal(true)
            }}
            onDeleteEvent={async (event) => {
              await deleteCalendarEvent(event.id)
              setSelectedCalendarEvent(null)
              await reloadCalendar()
            }}
            onPrevMonth={() => {
              if (calendarMonth === 0) {
                setCalendarMonth(11)
                setCalendarYear((value) => value - 1)
              } else {
                setCalendarMonth((value) => value - 1)
              }
            }}
            onNextMonth={() => {
              if (calendarMonth === 11) {
                setCalendarMonth(0)
                setCalendarYear((value) => value + 1)
              } else {
                setCalendarMonth((value) => value + 1)
              }
            }}
            onToday={() => {
              const now = new Date()
              setCalendarYear(now.getFullYear())
              setCalendarMonth(now.getMonth())
            }}
            readOnly={!canManage || isArchived}
          />
        </div>
      ) : null}

      {activeTab === 'Teams' ? (
        <div role="tabpanel" id="tabpanel-teams" aria-labelledby="tab-teams" tabIndex={0}>
          <SprintTeamPanel
            sprintId={detail.sprint.id}
            teams={detail.teams}
            members={detail.members}
            canEdit={Boolean(canManage)}
            isArchived={Boolean(isArchived)}
            onChanged={loadDetail}
          />
        </div>
      ) : null}

      {activeTab === 'Members' ? (
        <div role="tabpanel" id="tabpanel-members" aria-labelledby="tab-members" tabIndex={0}>
          <SprintMemberPanel
            sprintId={detail.sprint.id}
            sprintName={detail.sprint.name}
            members={detail.members}
            teams={detail.teams}
            canEdit={Boolean(canManage)}
            isArchived={Boolean(isArchived)}
            onChanged={loadDetail}
          />
        </div>
      ) : null}

      {activeTab === 'Review' ? (
        <div role="tabpanel" id="tabpanel-review" aria-labelledby="tab-review" tabIndex={0}>
          <SprintReview
            sprint={detail.sprint}
            canManage={Boolean(canManage)}
            onSaved={loadDetail}
          />
        </div>
      ) : null}

      {detail.sprint.status === 'archived' ? (
        <div className="text-sm text-[var(--text-secondary)]">
          Sprint archived. <Link to="/sprints" className="text-[var(--accent)]">Back to all sprints</Link>
        </div>
      ) : null}
      {showEventModal ? (
        <EventModal
          event={selectedCalendarEvent}
          defaultDate={calendarDefaultDate}
          initialSprintId={sprintId}
          canEditOverride={Boolean(canManage && !isArchived)}
          onSaved={async () => {
            setShowEventModal(false)
            setSelectedCalendarEvent(null)
            setCalendarDefaultDate(null)
            await reloadCalendar()
          }}
          onClose={() => {
            setShowEventModal(false)
            setSelectedCalendarEvent(null)
            setCalendarDefaultDate(null)
          }}
        />
      ) : null}
    </div>
  )
}
