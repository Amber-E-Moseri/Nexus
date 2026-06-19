import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent } from '../../lib/calendar'
import { advanceSprintStatus, archiveSprintWithAutoDeactivation, calculateSprintTaskStats, createSprintTeam, duplicateSprint, getSprintDetail, getSprintTasks, getTemporarySprintMembers, restoreSprint, shouldAutoStartSprint, updateSprint } from '../../lib/sprints'
import { supabase } from '../../lib/supabase'
import { isTaskCompleted } from '../../lib/taskStatuses'
import SprintProgressBar from '../../modules/sprints/SprintProgressBar'
import CalendarView from '../../modules/calendar/CalendarView'
import EventModal from '../../modules/calendar/EventModal'
import SprintMemberPanel from '../../modules/sprints/SprintMemberPanel'
import SprintTaskBoard from '../../modules/sprints/SprintTaskBoard'
import SprintTeamPanel from '../../modules/sprints/SprintTeamPanel'
import CreateTeamModal from '../../modules/sprints/CreateTeamModal'
import SprintReview from './SprintReview'
import FileList from '../../components/files/FileList'

const TABS = ['Overview', 'Tasks', 'Calendar', 'Teams', 'Members', 'Files', 'Review']
const CALENDAR_EVENT_SELECT = 'id, title, description, event_type, start_date, end_date, all_day, location, zoom_join_url, sprint_id, space_id, created_by, created_at, status, department_id, approved_by, approved_at, rejection_note, is_org_wide'

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
function getNextAction(sprint) {
  const actions = {
    planning: { label: 'Start Sprint', next: 'active' },
    active: { label: 'Complete Sprint', next: 'completed' },
    completed: { label: 'Begin Review', next: 'review' },
  }

  if (sprint.status === 'planning' && shouldAutoStartSprint(sprint)) {
    return { label: 'Start Now', next: 'active', urgent: true }
  }

  return actions[sprint.status]
}

function Stat({ label, value, bg, textColor, border }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '16px 18px',
        background: bg,
        border: border ? `1px solid ${border}` : 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -20,
          bottom: -24,
          width: 80,
          height: 80,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.07)',
        }}
      />
      <div
        style={{
          fontSize: '10.5px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: textColor,
          opacity: 0.85,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          lineHeight: 1,
          marginTop: 8,
          color: textColor,
        }}
      >
        {value}
      </div>
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
  const [loadError, setLoadError] = useState(null)
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
  const [savingTeam, setSavingTeam] = useState(false)
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [temporaryMembers, setTemporaryMembers] = useState([])

  const completion = useMemo(() => {
    if (tasks.length === 0) return 0
    const done = tasks.filter((task) => isTaskCompleted(task)).length
    return Math.round((done / tasks.length) * 100)
  }, [tasks])

  const tasksByStatus = useMemo(() => {
    const grouped = {}
    tasks.forEach((task) => {
      const status = task.status_name || 'Unknown'
      if (!grouped[status]) grouped[status] = 0
      grouped[status] += 1
    })
    return grouped
  }, [tasks])

  const canManage = role === 'super_admin' || detail?.members?.some(
    (member) => member.user?.id === profile?.id && ['owner', 'manager'].includes(member.role),
  )
  const canCreateSprint = role === 'super_admin' || role === 'dept_lead'

  async function loadDetail() {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextDetail, nextTasks, tempMembers] = await Promise.all([
        getSprintDetail(sprintId),
        getSprintTasks(sprintId),
        getTemporarySprintMembers(sprintId).catch(() => []),
      ])
      setDetail(nextDetail)
      setTasks(nextTasks)
      setTemporaryMembers(tempMembers)
      setGoalDraft(nextDetail.sprint.goal ?? '')
      setDescriptionDraft(nextDetail.sprint.description ?? '')
    } catch (error) {
      console.error('Failed to load sprint:', error)
      setDetail(null)
      setTasks([])
      setTemporaryMembers([])
      if (error?.code === 'PGRST116' || error?.message?.includes('no rows')) {
        setLoadError('This sprint was deleted.')
      } else {
        setLoadError(error?.message || 'Failed to load sprint')
      }
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
      .select(CALENDAR_EVENT_SELECT)
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

  if (loading) {
    return <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading...</div>
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {loadError}
        </div>
        <Link to="/sprints" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          ← Back to All Sprints
        </Link>
      </div>
    )
  }

  if (!detail?.sprint) {
    return <div className="rounded-[20px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">Sprint not found.</div>
  }

  const isArchived = detail?.sprint?.status === 'archived'
  const visibleTabs = detail?.sprint?.status === 'completed' || detail?.sprint?.status === 'review' || detail?.sprint?.status === 'archived'
    ? TABS
    : TABS.filter((tab) => tab !== 'Review')

  const reviewCompleted = Boolean(detail?.review?.reviewed_at ?? detail?.review?.completed_at)

  async function reloadCalendar() {
    setCalendarLoading(true)
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(CALENDAR_EVENT_SELECT)
        .eq('sprint_id', sprintId)
        .order('start_date', { ascending: true })

      if (error) throw error
      setCalendarEvents(data ?? [])
    } finally {
      setCalendarLoading(false)
    }
  }

  async function handleAdvance() {
    const action = getNextAction(detail.sprint)
    if (!action) return
    try {
      await advanceSprintStatus(detail.sprint.id, action.next)
      await loadDetail()
      if (action.next === 'review') {
        setActiveTab('Review')
      }
    } catch (err) {
      console.error('Failed to advance sprint:', err)
      alert(`Failed to advance sprint: ${err?.message || String(err)}`)
    }
  }

  async function handleArchive() {
    let confirmMessage = 'Archive this sprint? You can restore it later from the sprints list.'
    if (temporaryMembers.length > 0) {
      const memberNames = temporaryMembers
        .map((m) => m.users?.name || m.users?.email)
        .filter(Boolean)
        .join(', ')
      confirmMessage = `⚠️ This will deactivate ${temporaryMembers.length} temporary member(s): ${memberNames}\n\n${confirmMessage}`
    }
    if (!window.confirm(confirmMessage)) return
    try {
      await archiveSprintWithAutoDeactivation(detail.sprint.id)
      await loadDetail()
    } catch (err) {
      console.error('Failed to archive sprint:', err)
      alert(`Failed to archive sprint: ${err?.message || String(err)}`)
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

  function handleCreateTeam() {
    setShowCreateTeamModal(true)
  }

  async function handleSaveTeam(teamName) {
    setSavingTeam(true)
    try {
      await createSprintTeam(detail.sprint.id, teamName)
      setShowCreateTeamModal(false)
      await loadDetail()
    } catch (err) {
      alert(`Failed to create team: ${err?.message || String(err)}`)
    } finally {
      setSavingTeam(false)
    }
  }

  async function handleExportToGoogleDrive() {
    if (!detail?.sprint || !tasks) return

    try {
      // Generate CSV content
      const headers = ['Title', 'Status', 'Assignee', 'Due Date']
      const rows = tasks.map((task) => [
        task.title,
        task.status_name || 'Unknown',
        task.assigned_to_name || 'Unassigned',
        task.due_at ? new Date(task.due_at).toLocaleDateString() : 'None',
      ])

      let csv = headers.join(',') + '\n'
      csv += rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

      const { data: { session } } = await supabase.auth.getSession()
      const fileName = `Sprint Report - ${detail.sprint.name}.csv`

      const formData = new FormData()
      formData.append('file', new Blob([csv], { type: 'text/csv' }), fileName)
      formData.append('file_name', fileName)
      formData.append('meeting_id', detail.sprint.id) // Use as identifier for tracking

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      )

      if (!response.ok) {
        const error = await response.json()
        alert(`Export failed: ${error.error}`)
        return
      }

      alert('Sprint report exported to Google Drive!')
    } catch (err) {
      alert(`Export error: ${String(err)}`)
    }
  }

  const healthStatus = completion >= 70 ? 'On track' : 'At risk'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-[var(--text-primary)]">{detail.sprint.name}</h1>
              {detail.sprint.status === 'active' && <Badge tone="success">Active</Badge>}
              {completion >= 70 && <Badge tone="success">On track</Badge>}
            </div>
            <div className="mt-2 text-sm text-[var(--text-tertiary)]">
              {detail.sprint.start_date && detail.sprint.end_date
                ? `${new Date(detail.sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${new Date(detail.sprint.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} • ${detail.sprint?.department?.name || 'Space'}`
                : 'No dates set'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {getNextAction(detail.sprint) && canManage && !isArchived ? (
              <button type="button" onClick={handleAdvance} disabled={detail.sprint.status === 'review' && !reviewCompleted} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {getNextAction(detail.sprint).label}
              </button>
            ) : null}
            <button type="button" onClick={handleArchive} disabled={isArchived} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50">
              {isArchived ? 'Archived' : 'Archive sprint'}
            </button>
            <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">
              Close
            </button>
          </div>
        </div>
      </div>

      {isArchived && <ArchivedSprintBanner sprint={detail.sprint} onRestore={handleRestore} userRole={role} />}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="COMPLETED" value={`${tasks.filter((t) => isTaskCompleted(t)).length}/${tasks.length}`} bg="#5B34C7" textColor="white" />
        <Stat label="PROGRESS" value={`${completion}%`} bg="#1C1C2E" textColor="white" />
        <Stat label="REMAINING" value={tasks.length - tasks.filter((t) => isTaskCompleted(t)).length} bg="#E8A020" textColor="white" />
        <Stat label="TEAMS" value={detail.teams.length} bg="#FEF0ED" textColor="#C94830" border="#F9C4B3" />
      </div>

      {/* Progress Bar */}
      {tasks.length > 0 && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintProgressBar tasksCount={calculateSprintTaskStats(tasks)} compact={false} />
        </div>
      )}

      {/* Tasks & Tabs */}
      {activeTab === 'Tasks' || activeTab === 'Overview' ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintTaskBoard sprintId={detail.sprint.id} canEdit={Boolean(canManage && !isArchived)} />
        </div>
      ) : null}

      {/* Review Section */}
      {detail.sprint.status === 'completed' || detail.sprint.status === 'review' ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Review</h2>
            <span className="text-xs text-[var(--text-tertiary)]">{reviewCompleted ? 'Completed' : '0 of 6 sections completed'}</span>
          </div>
          <SprintReview sprint={detail.sprint} canManage={Boolean(canManage)} onSaved={loadDetail} />
        </div>
      ) : null}

      {/* Teams Section */}
      {detail.teams.length > 0 && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Teams</h2>
            <button
              type="button"
              onClick={handleCreateTeam}
              disabled={savingTeam || isArchived}
              className="text-xs text-[var(--accent)] disabled:opacity-50"
            >
              + New team
            </button>
          </div>
          <p className="mb-4 text-xs text-[var(--text-tertiary)]">Cross-functional squads – name them and pull in members from any department.</p>
          <SprintTeamPanel sprintId={detail.sprint.id} teams={detail.teams} members={detail.members} canEdit={Boolean(canManage)} isArchived={Boolean(isArchived)} onChanged={loadDetail} />
        </div>
      )}

      {/* Members Section */}
      <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <SprintMemberPanel
          sprintId={detail.sprint.id}
          sprintName={detail.sprint.name}
          sprintEndDate={detail.sprint.end_date}
          members={detail.members || []}
          teams={detail.teams || []}
          canEdit={Boolean(canManage && !isArchived)}
          isArchived={Boolean(isArchived)}
          onChanged={loadDetail}
        />
      </div>


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

      <CreateTeamModal
        open={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        onSave={handleSaveTeam}
        saving={savingTeam}
      />
    </div>
  )
}
