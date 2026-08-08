import { useCallback, useMemo, useState } from 'react'
import { UsersRound } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { canAssignOrgWide } from '../../../lib/permissions'
import AssignedToMeToggle from '../../tasks/components/AssignedToMeToggle'
import KanbanBoard from '../../tasks/components/KanbanBoard'
import TaskFilters from '../../tasks/components/TaskFilters'
import TaskListView from '../../tasks/components/TaskListView'
import TaskModal from '../../tasks/components/TaskModal'
import SprintReviewView from './SprintReviewView'
import AllTeamsBoard from './AllTeamsBoard'
import { TasksProvider, useTasks } from '../../tasks/TasksContext'
import { useTaskFilters } from '../../tasks/hooks/useTaskFilters'
import { STALE_COMPLETED_TASK_DAYS } from '../../../lib/taskStatuses'
import TaskSearchInput, { filterTasksBySearch } from '../../tasks/components/TaskSearchInput'
import { followTask } from '../../tasks/lib/followers'

function BulkTasksBanner({ tasks, statuses, canEdit, onStatusChange, onTaskClick }) {
  if (!tasks.length) return null

  return (
    <section
      aria-label="Shared sprint tasks"
      className="mx-5 mt-4 border-y border-[var(--border)] bg-[var(--purple-tint)] px-4 py-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-white text-[var(--accent)]"><UsersRound size={16} aria-hidden="true" /></span>
        <div>
          <div className="text-sm font-bold text-[var(--text-primary)]">Shared sprint tasks</div>
          <div className="text-xs text-[var(--text-secondary)]">Individual tasks created for everyone or all team leads</div>
        </div>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
            <button
              type="button"
              onClick={() => onTaskClick(task)}
              className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-sm font-semibold text-[var(--text-primary)]"
            >
              {task.title}
            </button>
            {task.due_date ? <span className="text-xs text-[var(--text-secondary)]">Due {new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}</span> : null}
            {canEdit ? (
              <select
                aria-label={`Change status for ${task.title}`}
                value={task.status_id ?? ''}
                onChange={(event) => onStatusChange({ taskId: task.id, newStatus: event.target.value })}
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--text-primary)]"
              >
                {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function SprintTasksInner({ sprintId, sprint, canEdit, onArchived }) {
  const { profile, role } = useAuth()
  const { tasks, loading, error, statuses, defaultStatusId, moveTask, addTask } = useTasks()

  // Sprint boards always show the 6 canonical org-level status columns only.
  // Tasks with dept-specific status_ids are matched via org_status_id (stored on
  // each dept status in the merged `statuses` array) so they still appear.
  const orgStatusColumns = useMemo(() => {
    const orgOnes = statuses.filter((s) => s.is_org_status)

    // If no org statuses in the merged array (all replaced by dept equivalents), fall back
    if (!orgOnes.length) return statuses

    // Build a lookup: orgStatusId → [deptStatusId, ...]
    const deptIdsByOrgId = {}
    for (const s of statuses) {
      if (!s.is_org_status && s.org_status_id) {
        ;(deptIdsByOrgId[s.org_status_id] ??= []).push(s.id)
      }
    }

    return orgOnes.map((orgStatus) => ({
      ...orgStatus,
      _mergedIds: [orgStatus.id, ...(deptIdsByOrgId[orgStatus.id] ?? [])],
    }))
  }, [statuses])
  const [view, setView] = useState('kanban')
  const [teamView, setTeamView] = useState(canEdit ? 'my' : 'all')
  const [modal, setModal] = useState(null)
  const [taskSearch, setTaskSearch] = useState('')
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks, {
    defaultDateClosedRangeDays: STALE_COMPLETED_TASK_DAYS.SPACE,
    persistKey: `blw_date_closed_filter_sprint_${sprint?.id}`,
  })
  const searchedTasks = useMemo(() => filterTasksBySearch(filtered, taskSearch), [filtered, taskSearch])
  const bulkTasks = useMemo(
    () => searchedTasks.filter((task) => task.is_bulk_assigned && (
      task.assignee_id === profile?.id || task.created_by === profile?.id
    )),
    [profile?.id, searchedTasks],
  )
  const boardTasks = useMemo(() => searchedTasks.filter((task) => !task.is_bulk_assigned), [searchedTasks])
  const assignedToMe = Boolean(profile?.id) && filters.assigneeId === profile.id
  const toggleAssignedToMe = () => setFilters((prev) => ({ ...prev, assigneeId: prev.assigneeId === profile?.id ? null : profile?.id }))

  const members = sprint?.members ?? []

  const teamsWithMembers = useMemo(() => {
    const teams = sprint?.teams ?? []
    const allMembers = sprint?.members ?? []
    return teams.map((team) => ({
      ...team,
      sprint_team_members: allMembers
        .filter((m) => m.sprint_team_ids?.includes(team.id))
        .map((m) => ({ user_id: m.user_id, users: m.user })),
    }))
  }, [sprint?.teams, sprint?.members])

  // Team picker scope: org-wide roles see all teams; everyone else sees only
  // the teams they're a member of (so the dropdown isn't overwhelming and
  // tasks can't be mis-assigned to unrelated teams).
  const pickerTeams = useMemo(() => {
    if (canAssignOrgWide(profile, role)) return teamsWithMembers
    return teamsWithMembers.filter((t) =>
      t.sprint_team_members?.some((m) => m.user_id === profile?.id)
    )
  }, [teamsWithMembers, profile, role])

  function handleTaskStatusChange({ taskId, newStatus }) {
    moveTask(taskId, newStatus)
  }

  const getMyTeams = useCallback(() => {
    if (!teamsWithMembers) return []
    return teamsWithMembers.filter((team) =>
      team.sprint_team_members?.some((member) => member.user_id === profile?.id),
    )
  }, [teamsWithMembers, profile?.id])

  const getMyTeamTasks = useCallback(() => {
    if (!boardTasks) return []
    const myTeams = getMyTeams()
    const myTeamIds = myTeams.map((t) => t.id)

    return boardTasks.filter((task) => {
      if (task.sprint_team_id) return myTeamIds.includes(task.sprint_team_id)
      // A task without a team is personal only when it is directly assigned to
      // the viewer. Creating a task must not make it appear in "My Team" for
      // an administrator or sprint manager who can create work for every team.
      return task.assignee_id === profile?.id
    })
  }, [boardTasks, teamsWithMembers, profile?.id, getMyTeams])

  // "My Team" merges every team the viewer belongs to into one flat list
  // with no team attribution — confusing when the viewer is in more than
  // one team. Only computed (and only passed to the board) in that case;
  // a single-team viewer doesn't need the disambiguation.
  const teamLabelByAssigneeId = useMemo(() => {
    const myTeams = getMyTeams()
    if (myTeams.length <= 1 || !teamsWithMembers) return null
    const map = {}
    for (const team of teamsWithMembers) {
      for (const member of team.sprint_team_members ?? []) {
        // An assignee can themselves belong to more than one team — join
        // all matching team names into one badge rather than picking one
        // arbitrarily or depending on iteration order.
        map[member.user_id] = map[member.user_id] ? `${map[member.user_id]}, ${team.name}` : team.name
      }
    }
    return map
  }, [teamsWithMembers, getMyTeams])

  // Group tasks by team for "All Teams" view
  const getTasksByTeam = useMemo(() => {
    if (!boardTasks || !teamsWithMembers) return {}

    const grouped = {}
    const assignedTaskIds = new Set()

    teamsWithMembers.forEach((team) => {
      const teamTasks = boardTasks.filter((task) =>
        !assignedTaskIds.has(task.id) && (
          task.sprint_team_id === team.id ||
          (!task.sprint_team_id && team.sprint_team_members?.some((m) => m.user_id === task.assignee_id))
        ),
      )
      grouped[team.id] = { team, tasks: teamTasks }
      teamTasks.forEach((t) => assignedTaskIds.add(t.id))
    })

    const unassigned = boardTasks.filter((t) => !assignedTaskIds.has(t.id))
    if (unassigned.length > 0) {
      grouped['__unassigned__'] = {
        team: { id: '__unassigned__', name: 'Unassigned' },
        tasks: unassigned,
      }
    }

    return grouped
  }, [boardTasks, teamsWithMembers])

  const resolveDeptId = useCallback((assigneeId) => {
    if (sprint?.sprint?.department_id) return sprint.sprint.department_id
    if (!assigneeId || !teamsWithMembers?.length) return null
    const match = teamsWithMembers.find(
      (t) => t.department_id && t.sprint_team_members?.some((m) => m.user_id === assigneeId),
    )
    return match?.department_id ?? null
  }, [sprint?.sprint?.department_id, teamsWithMembers])

  const resolveSprintTeamId = useCallback((assigneeId, selectedTeamId = null) => {
    if (!assigneeId || !teamsWithMembers.length) return selectedTeamId
    const matchingTeams = teamsWithMembers.filter((team) =>
      team.sprint_team_members?.some((member) => member.user_id === assigneeId),
    )
    if (matchingTeams.length === 1) return matchingTeams[0].id
    return matchingTeams.find((team) => team.id === selectedTeamId)?.id ?? matchingTeams[0]?.id ?? selectedTeamId
  }, [teamsWithMembers])

  const createSprintTask = useCallback(async (draft) => {
    const assigneeId = draft.assigneeId ?? draft.assignee_id ?? null
    const sprintTeamId = resolveSprintTeamId(assigneeId, draft.sprintTeamId ?? draft.sprint_team_id ?? null)
    const created = await addTask({
      title: draft.title,
      statusId: draft.statusId,
      priority: draft.priority,
      dueDate: draft.dueDate,
      dueTime: draft.dueTime,
      assignee_id: assigneeId,
      assigneeIds: draft.assigneeIds,
      department_id: resolveDeptId(assigneeId),
      sprint_team_id: sprintTeamId,
      subtasks: draft.subtasks,
    })

    if (created?.id && sprintTeamId && profile?.id && assigneeId && assigneeId !== profile.id) {
      try {
        await followTask(created.id, profile.id, profile.id)
      } catch (error) {
        // The task itself is already created; keep a watcher failure non-blocking.
        console.warn('Could not add the assigning user as a watcher:', error)
      }
    }
    return created
  }, [addTask, profile?.id, resolveDeptId, resolveSprintTeamId])

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-tertiary)]">Loading sprint tasks…</div>
  }

  if (error) {
    return <div className="p-6 text-sm text-[var(--coral-dark)]">Failed to load sprint tasks: {error}</div>
  }

  const hasTeams = Boolean(teamsWithMembers?.length)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
          {['kanban', 'list', 'review'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                cursor: 'pointer',
                border: 'none',
                background: view === option ? 'white' : 'transparent',
                color: view === option ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: view === option ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
              }}
            >
              {option === 'kanban' ? 'Board' : option === 'list' ? 'List' : 'Review'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {view !== 'review' && <TaskSearchInput value={taskSearch} onChange={setTaskSearch} />}
          {hasTeams && view !== 'review' ? (
            <div className="flex items-center gap-1 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
              <button
                type="button"
                onClick={() => setTeamView('my')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: teamView === 'my' ? 'white' : 'transparent',
                  color: teamView === 'my' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: teamView === 'my' ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                My Team
              </button>
              <button
                type="button"
                onClick={() => setTeamView('all')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: teamView === 'all' ? 'white' : 'transparent',
                  color: teamView === 'all' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: teamView === 'all' ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                All Teams
              </button>
            </div>
          ) : null}
          <AssignedToMeToggle active={assignedToMe} onClick={toggleAssignedToMe} />
          {canEdit ? (
            <button
              type="button"
              onClick={() => setModal({ mode: 'create', defaultStatus: defaultStatusId })}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              + New task
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-5">
        <TaskFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          members={members}
          statuses={statuses}
          tasks={tasks}
          showDateClosedFilter
        />
      </div>

      {view !== 'review' ? (
        <BulkTasksBanner
          tasks={bulkTasks}
          statuses={orgStatusColumns}
          canEdit={canEdit}
          onStatusChange={handleTaskStatusChange}
          onTaskClick={(task) => setModal({ mode: 'edit', task })}
        />
      ) : null}

      <div className="flex-1 overflow-hidden px-5 pb-5 pt-4">
        {view === 'kanban' && hasTeams && teamView === 'all' ? (
          <AllTeamsBoard
            tasks={boardTasks}
            tasksByTeam={getTasksByTeam}
            sprint={sprint}
            currentUser={profile}
            onTaskClick={(task) => setModal({ mode: 'edit', task })}
            onCreateTask={canEdit ? createSprintTask : undefined}
            readOnly={!canEdit}
            teamMembers={members}
            statuses={orgStatusColumns}
          />
        ) : view === 'kanban' ? (
          <div className="h-full overflow-x-auto">
            <KanbanBoard
              filteredTasks={hasTeams && teamView === 'my' ? getMyTeamTasks() : boardTasks}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onCreateTask={canEdit ? createSprintTask : undefined}
              readOnly={!canEdit}
              teamMembers={members}
              statusesOverride={orgStatusColumns}
              teamLabelByAssigneeId={teamView === 'my' ? teamLabelByAssigneeId : null}
              sprintTeams={pickerTeams}
              currentUserId={profile?.id}
            />
          </div>
        ) : view === 'list' ? (
          <div className="overflow-y-auto rounded-[16px] border border-[var(--border)] bg-white" style={{ minHeight: 200 }}>
            <TaskListView
              tasks={hasTeams && teamView === 'my' ? getMyTeamTasks() : boardTasks}
              statuses={orgStatusColumns}
              canAddTask={canEdit}
              onCreateTask={canEdit ? createSprintTask : undefined}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onTaskStatusChange={canEdit ? handleTaskStatusChange : undefined}
              people={Object.fromEntries(members.map((m) => [m.id, m]))}
              priorities={{}}
              teamMembers={members}
            />
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
            <SprintReviewView sprint={{ id: sprintId, status: sprint?.sprint?.status }} canEdit={canEdit} onArchived={onArchived} />
          </div>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          defaultStatus={modal.defaultStatus ?? ''}
          sprintId={sprintId}
          departmentId={sprint?.sprint?.department_id}
          sprintTeams={teamsWithMembers}
          isReadOnly={!canEdit}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}

export default function SprintTaskBoard({ sprintId, sprint, canEdit, initialTasks, onArchived }) {
  return (
    <TasksProvider sprintId={sprintId} departmentId={sprint?.sprint?.department_id} initialTasks={initialTasks}>
      <SprintTasksInner sprintId={sprintId} sprint={sprint} canEdit={canEdit} onArchived={onArchived} />
    </TasksProvider>
  )
}
