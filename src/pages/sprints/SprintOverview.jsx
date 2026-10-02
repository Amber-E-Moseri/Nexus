import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent } from '../../features/calendar'
import { advanceSprintStatus, archiveSprintWithAutoDeactivation, calculateSprintTaskStats, createSprintTeam, duplicateSprint, getSprintDetail, getSprintTasks, getTemporarySprintMembers, hasSprintAccess, restoreSprint, shouldAutoStartSprint, updateSprint, SPRINT_MEMBER_WITH_TEMP_SELECT } from '../../features/sprints'
import { supabase } from '../../lib/supabase'
import { requestSprintAccess, getMySprintAccessRequests } from '../../lib/people/api'
import { isTaskCompleted } from '../../lib/taskStatuses'
import SprintModal from '../../features/sprints/components/SprintModal'
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
import SprintMeetingsPanel from '../../features/sprints/components/SprintMeetingsPanel'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'
import { hasSpaceRole, isProgramsMember } from '../../lib/permissions'

const STATUS_LABELS = { planning: 'Planning', active: 'Active', completed: 'Completed', review: 'In Review', archived: 'Archived' }
const STATUS_DOT = { planning: '#9CA3AF', active: '#22C55E', completed: '#3B82F6', review: '#F59E0B', archived: '#9CA3AF' }
const CATEGORY_BG = { regional: '#7C3AED', group: '#0891B2' }

const TABS = ['Overview', 'Tasks', 'Members', 'Calendar', 'Meetings', 'Teams', 'Files', 'Review']
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
  const [activeTab, setActiveTab] = useState('Tasks')
  const [detail, setDetail] = useState(null)
  const [tasks, setTasks] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [savingOverview, setSavingOverview] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null)
  const [calendarDefaultDate, setCalendarDefaultDate] = useState(null)
  const [savingTeam, setSavingTeam] = useState(false)
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [showEditSprintModal, setShowEditSprintModal] = useState(false)
  const [showInviteExternalModal, setShowInviteExternalModal] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const [temporaryMembers, setTemporaryMembers] = useState([])
  // regional_secretary deliberately excluded from the unrestricted bypass —
  // sprints are membership-gated for everyone except super_admin/programs/
  // ors/dept_lead; matches can_manage_sprint()'s own authority model.
  const [canViewSprint, setCanViewSprint] = useState(
    role === 'super_admin' ||
    hasSpaceRole(profile, null, 'ors') ||
    hasSpaceRole(profile, null, 'programs') ||
    hasSpaceRole(profile, null, 'dept_lead')
  )
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

  const canManage = role === 'super_admin' || role === 'regional_secretary' || hasSpaceRole(profile, null, 'dept_lead') || hasSpaceRole(profile, null, 'programs') || detail?.members?.some(
    (member) => member.user?.id === profile?.id && ['owner', 'manager'].includes(member.role),
  )
  const isMember = detail?.members?.some((member) => (member.user_id ?? member.user?.id) === profile?.id)
  const canCreateTask = canManage || isMember || isProgramsMember(profile)
  const canAssignPrivilegedSprintRoles = role === 'super_admin' || hasSpaceRole(profile, null, 'dept_lead') || hasSpaceRole(profile, null, 'programs') || detail?.members?.some(
    (member) => member.user?.id === profile?.id && member.role === 'owner',
  )
  const canCreateSprint = role === 'super_admin' || role === 'dept_lead' || role === 'pastor' || role === 'regional_secretary' || hasSpaceRole(profile, null, 'dept_lead') || hasSpaceRole(profile, null, 'programs')

  async function loadDetail() {
    setLoading(true)
    setLoadError(null)
    try {
      const isPrivileged =
        role === 'super_admin' ||
        hasSpaceRole(profile, null, 'ors') ||
        hasSpaceRole(profile, null, 'programs')

      if (!isPrivileged) {
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
      const updated = await advanceSprintStatus(detail.sprint.id, action.next)
      setDetail((prev) => prev ? { ...prev, sprint: updated } : null)
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
      setDetail((prev) => prev ? {
        ...prev,
        sprint: { ...prev.sprint, status: 'archived', is_archived: true, archived_at: new Date().toISOString() }
      } : null)
    } catch (err) {
      console.error('Failed to archive sprint:', err)
      alert(`Failed to archive sprint: ${err?.message || String(err)}`)
    }
  }

  function handleBoardArchived() {
    setDetail((prev) => prev ? {
      ...prev,
      sprint: { ...prev.sprint, status: 'archived', is_archived: true, archived_at: new Date().toISOString() }
    } : null)
  }

  async function reloadTeamsAndMembers() {
    try {
      const { data: teamsRes } = await supabase.from('sprint_teams').select('id, name, description, lead_user_id').eq('sprint_id', sprintId).order('created_at')
      // .order('user_id') is a stable tiebreaker for members sharing an identical joined_at
      // (bulk-added at once) — see the matching comment in getSprintDetail (sprints.js).
      const { data: membersRes } = await supabase.from('sprint_members').select(`${SPRINT_MEMBER_WITH_TEMP_SELECT}, user:user_id(id, name, email, status, is_temporary)`).eq('sprint_id', sprintId).order('joined_at').order('user_id')

      if (teamsRes && membersRes) {
        const sprintTeamIds = teamsRes.map((t) => t.id)
        let teamMembershipsMap = {}
        if (sprintTeamIds.length > 0) {
          const { data: teamMemberships } = await supabase.from('sprint_team_members').select('team_id, user_id').in('team_id', sprintTeamIds)
          for (const row of teamMemberships ?? []) {
            if (!teamMembershipsMap[row.user_id]) teamMembershipsMap[row.user_id] = []
            teamMembershipsMap[row.user_id].push(row.team_id)
          }
        }
        const membersWithTeams = (membersRes ?? []).map((member) => ({ ...member, sprint_team_ids: teamMembershipsMap[member.user_id] ?? [] }))
        setDetail((prev) => prev ? { ...prev, teams: teamsRes, members: membersWithTeams } : null)
      }
    } catch (err) {
      console.error('Failed to refresh teams/members:', err)
    }
  }

  async function handleOverviewSave() {
    setSavingOverview(true)
    try {
      const updated = await updateSprint(detail.sprint.id, {
        goal: goalDraft.trim() || null,
        description: descriptionDraft.trim() || null,
      })
      setDetail((prev) => prev ? { ...prev, sprint: updated } : null)
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
        setDetail((prev) => prev ? { ...prev, sprint: result.data } : null)
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink-1)', margin: 0, lineHeight: 1.2 }}>
              {detail.sprint.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[detail.sprint.status] ?? '#9CA3AF', display: 'inline-block', flexShrink: 0 }} />
              {STATUS_LABELS[detail.sprint.status] ?? detail.sprint.status}
              {completion >= 70 && detail.sprint.status === 'active' && (
                <span style={{ marginLeft: 2, color: '#16A34A', fontWeight: 600 }}>· On track</span>
              )}
            </div>
          </div>
          <div className="mt-1.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {detail.sprint.start_date && detail.sprint.end_date
              ? `${new Date(detail.sprint.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${new Date(detail.sprint.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })} · ${detail.sprint?.department?.name || 'Space'}`
              : 'No dates set'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {getNextAction(detail.sprint) && canManage && !isArchived ? (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={detail.sprint.status === 'review' && !reviewCompleted}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--purple-700)', transition: 'background .13s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-600)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--purple-700)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {getNextAction(detail.sprint).label}
            </button>
          ) : null}
          {canManage && !isArchived ? (
            <button
              type="button"
              onClick={() => setShowEditSprintModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border-1)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink-1)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit sprint
            </button>
          ) : null}

          {/* Overflow: Archive + Duplicate */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowOverflowMenu((v) => !v)}
              className="flex items-center justify-center rounded-xl border border-[var(--border-1)] bg-white"
              style={{ width: 34, height: 34, fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)' }}
            >
              ⋯
            </button>
            {showOverflowMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowOverflowMenu(false)} />
                <div style={{ position: 'absolute', top: 38, right: 0, zIndex: 20, minWidth: 160, background: 'white', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => { setShowOverflowMenu(false); handleDuplicate() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                  >
                    Duplicate sprint
                  </button>
                  {!isArchived && (
                    <button
                      type="button"
                      onClick={() => { setShowOverflowMenu(false); handleArchive() }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', color: '#C94830' }}
                    >
                      Archive sprint
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isArchived && <ArchivedSprintBanner sprint={detail.sprint} onRestore={handleRestore} userRole={role} />}

      {/* Stats Grid — semantic accents: green done / blue progress /
          orange remaining / teal teams */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
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

      {/* Tab Navigation */}
      <div
        className="sprint-tabs-scroll"
        style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 4, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
              borderRadius: 0,
              transition: 'color 0.12s',
              letterSpacing: activeTab === tab ? '-0.01em' : 0,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Sprint Goals */}
      {activeTab === 'Overview' && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintGoalsPanel sprintId={detail.sprint.id} departmentId={detail.sprint.department_id} teams={detail.teams} />
        </div>
      )}

      {/* Tasks & Tabs */}
      {activeTab === 'Tasks' || activeTab === 'Overview' ? (
        <div className="flex flex-col rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]" style={{ minHeight: 520 }}>
          <SprintTaskBoard sprintId={detail.sprint.id} sprint={detail} canEdit={Boolean(canCreateTask && !isArchived)} initialTasks={tasks} onArchived={handleBoardArchived} />
        </div>
      ) : null}

      {/* Review Tab */}
      {activeTab === 'Review' && (detail.sprint.status === 'completed' || detail.sprint.status === 'review' || detail.sprint.status === 'archived') ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Review</h2>
            <span className="text-xs text-[var(--text-tertiary)]">{reviewCompleted ? 'Completed' : '0 of 6 sections completed'}</span>
          </div>
          <SprintReview sprint={detail.sprint} canManage={Boolean(canManage)} onSaved={(review) => {
            if (review) setDetail((prev) => prev ? { ...prev, review } : null)
          }} />
        </div>
      ) : null}

      {/* Teams Section */}
      {(activeTab === 'Overview' || activeTab === 'Teams') && (detail.teams.length > 0 || canManage) && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Teams</h2>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Cross-functional squads — name them and pull in members from any department.</p>
            </div>
            {(canManage || isMember) && !isArchived && (
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
            onTeamChanged={reloadTeamsAndMembers}
            onCreateTeam={async (name) => {
              setSavingTeam(true)
              try {
                await createSprintTeam(detail.sprint.id, { name, description: '', lead_user_id: null })
                await reloadTeamsAndMembers()
              } catch (err) {
                alert(`Failed to create team: ${err?.message || String(err)}`)
              } finally {
                setSavingTeam(false)
              }
            }}
          />
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'Calendar' && (
        <div className="min-w-0 overflow-x-auto">
          <CalendarView
            events={[
              ...calendarEvents,
              ...tasks
                .filter((t) => t.due_date && !isTaskCompleted(t))
                .map((t) => ({
                  id: `task-${t.id}`,
                  title: `☑ ${t.title}`,
                  start_date: t.due_date,
                  all_day: true,
                  color: '#0891b2',
                  _isTask: true,
                })),
            ]}
            loading={calendarLoading}
            year={calendarYear}
            month={calendarMonth}
            onPrevMonth={() => {
              if (calendarMonth === 0) { setCalendarYear((y) => y - 1); setCalendarMonth(11) }
              else setCalendarMonth((m) => m - 1)
            }}
            onNextMonth={() => {
              if (calendarMonth === 11) { setCalendarYear((y) => y + 1); setCalendarMonth(0) }
              else setCalendarMonth((m) => m + 1)
            }}
            onToday={() => { setCalendarYear(new Date().getFullYear()); setCalendarMonth(new Date().getMonth()) }}
            onEventClick={(ev) => { if (ev._isTask) { setActiveTab('Tasks') } else { setSelectedCalendarEvent(ev); setShowEventModal(true) } }}
            onDayClick={(date) => { setCalendarDefaultDate(date); setShowEventModal(true) }}
            onAddEvent={() => setShowEventModal(true)}
            readOnly={!canManage || isArchived}
          />
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'Members' && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintMemberPanel
            sprintId={detail.sprint.id}
            sprintName={detail.sprint.name}
            sprintEndDate={detail.sprint.end_date}
            members={detail.members ?? []}
            teams={detail.teams ?? []}
            canEdit={Boolean(canManage)}
            isArchived={Boolean(isArchived)}
            onChanged={reloadTeamsAndMembers}
          />
        </div>
      )}

      {/* Meetings — shown on Overview and its own tab */}
      {(activeTab === 'Overview' || activeTab === 'Meetings') && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <SprintMeetingsPanel
            sprintId={detail.sprint.id}
            canEdit={Boolean(canManage && !isArchived)}
          />
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'Files' && (
        <div className="rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-1)', margin: 0, fontFamily: 'var(--font-heading, inherit)' }}>Reference Docs</h2>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, marginBottom: 0 }}>Shared files and documents for this sprint</p>
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <FileList
              entityType="sprint"
              entityId={detail.sprint.id}
              showUpload={Boolean((isMember || canManage) && !isArchived)}
              sprintMembers={detail.members}
              sprintTeams={detail.teams}
            />
          </div>
        </div>
      )}

      {showInviteExternalModal && (
        <InviteExternalModal
          sprintId={detail.sprint.id}
          sprintName={detail.sprint.name}
          sprintEndDate={detail.sprint.end_date}
          teams={detail.teams ?? []}
          canInvite={Boolean((canManage || isMember) && !isArchived)}
          canAssignPrivilegedRoles={Boolean(canAssignPrivilegedSprintRoles)}
          onClose={() => setShowInviteExternalModal(false)}
          onSuccess={() => { setShowInviteExternalModal(false); void reloadTeamsAndMembers() }}
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
            await reloadTeamsAndMembers()
          }}
        />
      )}

      {showEditSprintModal && (
        <SprintModal
          mode="edit"
          sprint={detail.sprint}
          onSaved={(saved) => {
            setShowEditSprintModal(false)
            if (saved) setDetail((prev) => prev ? { ...prev, sprint: saved } : null)
          }}
          onClose={() => setShowEditSprintModal(false)}
        />
      )}
    </div>
  )
}
