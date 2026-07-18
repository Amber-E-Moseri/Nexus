import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent } from '../../features/calendar'
import { advanceSprintStatus, archiveSprintWithAutoDeactivation, calculateSprintTaskStats, createSprintTeam, duplicateSprint, getSprintDetail, getSprintTasks, getTemporarySprintMembers, hasSprintAccess, restoreSprint, shouldAutoStartSprint, updateSprint } from '../../features/sprints'
import { supabase } from '../../lib/supabase'
import { requestSprintAccess, getMySprintAccessRequests } from '../../lib/people/api'
import { isTaskCompleted } from '../../lib/taskStatuses'
import SprintProgressBar from '../../features/sprints/components/SprintProgressBar'
import CalendarView from '../../features/calendar/components/CalendarView'
import EventModal from '../../features/calendar/components/EventModal'
import SprintMemberPanel from '../../features/sprints/components/SprintMemberPanel'
import SprintTaskBoard from '../../features/sprints/components/SprintTaskBoard'
import SprintTeamPanel from '../../features/sprints/components/SprintTeamPanel'
import NewTeamModal from '../../features/sprints/components/NewTeamModal'
import InviteExternalModal from '../../features/sprints/components/InviteExternalModal'
import SprintReview from './SprintReview'
import FileList from '../../components/files/FileList'
import SprintGoalsPanel from '../../features/sprints/components/SprintGoalsPanel'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

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
          fontFamily: FONT_HEADING,
          fontSize: '10.5px',
          fontWeight: 600,
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
          fontFamily: FONT_HEADING,
          fontSize: 28,
          fontWeight: 700,
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
  const location = useLocation()
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
  const [showInviteExternalModal, setShowInviteExternalModal] = useState(false)
  const [temporaryMembers, setTemporaryMembers] = useState([])
  const [canViewSprint, setCanViewSprint] = useState(role === 'super_admin' || role === 'regional_secretary')
  const [accessDeniedSprint, setAccessDeniedSprint] = useState(null) // {name, description} when user lacks access
  const [accessRequestStatus, setAccessRequestStatus] = useState(null) // 'pending' | 'rejected' | null
  const [requestingAccess, setRequestingAccess] = useState(false)

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

  const canManage = role === 'super_admin' || role === 'regional_secretary' || detail?.members?.some(
    (member) => member.user?.id === profile?.id && ['owner', 'manager'].includes(member.role),
  )
  const canAssignPrivilegedSprintRoles = role === 'super_admin' || detail?.members?.some(
    (member) => member.user?.id === profile?.id && member.role === 'owner',
  )
  const canCreateSprint = role === 'super_admin' || role === 'dept_lead' || role === 'pastor'

  async function loadDetail() {
    setLoading(true)
    setLoadError(null)
    try {
      if (role !== 'super_admin' && role !== 'regional_secretary') {
        const allowed = await hasSprintAccess(sprintId)
        setCanViewSprint(allowed)
        if (!allowed) {
          setDetail(null)
          setTasks([])
          setTemporaryMembers([])
          // Fetch sprint name for the request card (RLS is open after migration)
          const nameFromState = location.state?.name
          if (nameFromState) {
            setAccessDeniedSprint({ name: nameFromState, description: null })
          } else {
            const { data: sprintRow } = await supabase
              .from('sprints')
              .select('id, name, description')
              .eq('id', sprintId)
              .maybeSingle()
            setAccessDeniedSprint(sprintRow ?? { name: 'Sprint', description: null })
          }
          // Check if user already requested access
          const requests = await getMySprintAccessRequests().catch(() => [])
          const existing = requests.find((r) => r.sprint_id === sprintId)
          setAccessRequestStatus(existing?.status ?? null)
          return
        }
      } else {
        setCanViewSprint(true)
      }

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
        setLoadError('This sprint no longer exists — it may have been deleted by an administrator.')
      } else {
        setLoadError(error?.message || 'Failed to load sprint')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!sprintId) return
    loadDetail()
  }, [sprintId])

  useEffect(() => {
    if (!canViewSprint) {
      setCalendarEvents([])
      setCalendarLoading(false)
      return
    }

    setCalendarLoading(true)
    supabase
      .from('calendar_events')
      .select(CALENDAR_EVENT_SELECT)
      .eq('sprint_id', sprintId)
      .is('deleted_at', null)
      .order('start_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error
        setCalendarEvents(data ?? [])
      })
      .catch(() => setCalendarEvents([]))
      .finally(() => setCalendarLoading(false))
  }, [canViewSprint, sprintId])

  useEffect(() => {
    if (!canViewSprint) {
      setRecentActivity([])
      return
    }

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
  }, [canViewSprint, sprintId])

  if (loading) {
    return <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading...</div>
  }

  if (accessDeniedSprint) {
    const isPending = accessRequestStatus === 'pending'
    const isRejected = accessRequestStatus === 'rejected'

    async function handleRequestAccess() {
      setRequestingAccess(true)
      try {
        await requestSprintAccess(sprintId)
        setAccessRequestStatus('pending')
      } catch (err) {
        console.error('Failed to request access:', err)
      } finally {
        setRequestingAccess(false)
      }
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1rem', fontFamily: FONT_BODY }}>
        <div style={{ maxWidth: 440, width: '100%', borderRadius: 20, border: '1px solid var(--border)', background: 'white', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: FONT_HEADING, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            {accessDeniedSprint.name}
          </div>
          {accessDeniedSprint.description && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {accessDeniedSprint.description}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            You are not a member of this sprint. Request access from the sprint owner, manager, or a regional secretary / super admin.
          </div>
          {isPending ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', padding: '10px 20px', borderRadius: 10, background: 'var(--surface-secondary)', marginBottom: 16 }}>
              Access request sent — awaiting approval
            </div>
          ) : isRejected ? (
            <div style={{ fontSize: 13, color: '#C94830', marginBottom: 16 }}>
              Your previous request was not approved. Contact the sprint owner directly.
            </div>
          ) : (
            <button
              type="button"
              disabled={requestingAccess}
              onClick={handleRequestAccess}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                background: 'var(--accent)',
                color: 'white',
                fontWeight: 600,
                fontSize: 14,
                border: 'none',
                cursor: requestingAccess ? 'default' : 'pointer',
                opacity: requestingAccess ? 0.7 : 1,
                marginBottom: 16,
              }}
            >
              {requestingAccess ? 'Requesting…' : 'Request Access'}
            </button>
          )}
          <div>
            <Link to="/sprints" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
              ← Back to All Sprints
            </Link>
          </div>
        </div>
      </div>
    )
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
        .is('deleted_at', null)
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
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>{detail.sprint.name}</h1>
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
              <button
                type="button"
                onClick={handleAdvance}
                disabled={detail.sprint.status === 'review' && !reviewCompleted}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--purple-700)', transition: 'background .13s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-600)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--purple-700)' }}
              >
                {getNextAction(detail.sprint).label}
              </button>
            ) : null}
            <button type="button" onClick={handleArchive} disabled={isArchived} className="rounded-xl border border-[var(--border-1)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink-1)] disabled:opacity-50">
              {isArchived ? 'Archived' : 'Archive sprint'}
            </button>
            <button type="button" className="rounded-xl border border-[var(--border-1)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink-1)]">
              Close
            </button>
          </div>
        </div>
      </div>

      {isArchived && <ArchivedSprintBanner sprint={detail.sprint} onRestore={handleRestore} userRole={role} />}

      {/* Stats Grid — semantic accents: green done / blue progress /
          orange remaining / teal teams */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="COMPLETED" value={`${tasks.filter((t) => isTaskCompleted(t)).length}/${tasks.length}`} bg="var(--accent-green)" textColor="white" />
        <Stat label="PROGRESS" value={`${completion}%`} bg="var(--accent-blue)" textColor="white" />
        <Stat label="REMAINING" value={tasks.length - tasks.filter((t) => isTaskCompleted(t)).length} bg="var(--accent-orange)" textColor="white" />
        <Stat label="TEAMS" value={detail.teams.length} bg="var(--accent-teal)" textColor="white" />
      </div>

      {/* Progress Bar */}
      {tasks.length > 0 && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintProgressBar tasksCount={calculateSprintTaskStats(tasks)} compact={false} />
        </div>
      )}

      {/* Sprint Goals */}
      {activeTab === 'Overview' && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintGoalsPanel sprintId={detail.sprint.id} departmentId={detail.sprint.department_id} />
        </div>
      )}

      {/* Tasks & Tabs */}
      {activeTab === 'Tasks' || activeTab === 'Overview' ? (
        <div className="flex flex-col rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]" style={{ minHeight: 520 }}>
          <SprintTaskBoard sprintId={detail.sprint.id} sprint={detail} canEdit={Boolean(canManage && !isArchived)} />
        </div>
      ) : null}

      {/* Review Tab */}
      {activeTab === 'Review' && (detail.sprint.status === 'completed' || detail.sprint.status === 'review' || detail.sprint.status === 'archived') ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Review</h2>
            <span className="text-xs text-[var(--text-tertiary)]">{reviewCompleted ? 'Completed' : '0 of 6 sections completed'}</span>
          </div>
          <SprintReview sprint={detail.sprint} canManage={Boolean(canManage)} onSaved={loadDetail} />
        </div>
      ) : null}

      {/* Teams Section */}
      {(detail.teams.length > 0 || canManage) && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Teams</h2>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Cross-functional squads — name them and pull in members from any department.</p>
            </div>
            {canManage && !isArchived && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowInviteExternalModal(true)}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  + Invite external
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('new-team-input')?.focus()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  + New team
                </button>
              </div>
            )}
          </div>
          <SprintTeamPanel
            sprintId={detail.sprint.id}
            teams={detail.teams}
            members={detail.members}
            canEdit={Boolean(canManage)}
            isArchived={Boolean(isArchived)}
            onChanged={loadDetail}
            onCreateTeam={async (name) => {
              setSavingTeam(true)
              try {
                await createSprintTeam(detail.sprint.id, { name, description: '', lead_user_id: null })
                await loadDetail()
              } catch (err) {
                alert(`Failed to create team: ${err?.message || String(err)}`)
              } finally {
                setSavingTeam(false)
              }
            }}
          />
        </div>
      )}

      {showInviteExternalModal && (
        <InviteExternalModal
          sprintId={detail.sprint.id}
          sprintName={detail.sprint.name}
          sprintEndDate={detail.sprint.end_date}
          canInvite={Boolean(canManage && !isArchived)}
          canAssignPrivilegedRoles={Boolean(canAssignPrivilegedSprintRoles)}
          onClose={() => setShowInviteExternalModal(false)}
          onSuccess={() => { setShowInviteExternalModal(false); loadDetail() }}
        />
      )}



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

      {showCreateTeamModal && (
        <NewTeamModal
          onClose={() => setShowCreateTeamModal(false)}
          onSuccess={async () => {
            setShowCreateTeamModal(false)
            await loadDetail()
          }}
        />
      )}
    </div>
  )
}
