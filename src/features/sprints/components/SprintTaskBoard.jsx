import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import AssignedToMeToggle from '../../tasks/components/AssignedToMeToggle'
import KanbanBoard from '../../tasks/components/KanbanBoard'
import TaskFilters from '../../tasks/components/TaskFilters'
import TaskListView from '../../tasks/components/TaskListView'
import TaskModal from '../../tasks/components/TaskModal'
import SprintReviewView from './SprintReviewView'
import AllTeamsBoard from './AllTeamsBoard'
import { TasksProvider, useTasks } from '../../tasks/TasksContext'
import { useTaskFilters } from '../../tasks/hooks/useTaskFilters'

function SprintTasksInner({ sprintId, sprint, canEdit }) {
  const { profile } = useAuth()
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
  const [teamView, setTeamView] = useState('all')
  const [modal, setModal] = useState(null)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)
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
    if (!filtered) return []
    const myTeams = getMyTeams()
    const myTeamIds = myTeams.map((t) => t.id)

    return filtered.filter((task) => {
      return (
        task.assignee_id === profile?.id ||
        myTeamIds.some((teamId) =>
          teamsWithMembers.find((t) => t.id === teamId)?.sprint_team_members?.some((m) => m.user_id === task.assignee_id),
        )
      )
    })
  }, [filtered, teamsWithMembers, profile?.id, getMyTeams])

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
    if (!filtered || !teamsWithMembers) return {}

    const grouped = {}

    teamsWithMembers.forEach((team) => {
      grouped[team.id] = {
        team,
        tasks: filtered.filter((task) => team.sprint_team_members?.some((m) => m.user_id === task.assignee_id)),
      }
    })

    return grouped
  }, [filtered, teamsWithMembers])

  const resolveDeptId = useCallback((assigneeId) => {
    if (sprint?.sprint?.department_id) return sprint.sprint.department_id
    if (!assigneeId || !teamsWithMembers?.length) return null
    const match = teamsWithMembers.find(
      (t) => t.department_id && t.sprint_team_members?.some((m) => m.user_id === assigneeId),
    )
    return match?.department_id ?? null
  }, [sprint?.sprint?.department_id, teamsWithMembers])

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
        />
      </div>

      <div className="flex-1 overflow-hidden px-5 pb-5 pt-4">
        {view === 'kanban' && hasTeams && teamView === 'all' ? (
          <AllTeamsBoard
            tasks={filtered}
            tasksByTeam={getTasksByTeam}
            sprint={sprint}
            currentUser={profile}
            onTaskClick={(task) => setModal({ mode: 'edit', task })}
            onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, department_id: resolveDeptId(draft.assigneeId), subtasks: draft.subtasks }) : undefined}
            readOnly={!canEdit}
            teamMembers={members}
            statuses={orgStatusColumns}
          />
        ) : view === 'kanban' ? (
          <div className="h-full overflow-x-auto">
            <KanbanBoard
              filteredTasks={hasTeams && teamView === 'my' ? getMyTeamTasks() : filtered}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, department_id: resolveDeptId(draft.assigneeId), subtasks: draft.subtasks }) : undefined}
              readOnly={!canEdit}
              teamMembers={members}
              statusesOverride={orgStatusColumns}
              teamLabelByAssigneeId={teamView === 'my' ? teamLabelByAssigneeId : null}
            />
          </div>
        ) : view === 'list' ? (
          <div className="overflow-y-auto rounded-[16px] border border-[var(--border)] bg-white" style={{ minHeight: 200 }}>
            <TaskListView
              tasks={hasTeams && teamView === 'my' ? getMyTeamTasks() : filtered}
              statuses={orgStatusColumns}
              canAddTask={canEdit}
              onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, department_id: resolveDeptId(draft.assigneeId), subtasks: draft.subtasks }) : undefined}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onTaskStatusChange={canEdit ? handleTaskStatusChange : undefined}
              people={Object.fromEntries(members.map((m) => [m.id, m]))}
              priorities={{}}
              teamMembers={members}
            />
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
            <SprintReviewView sprint={{ id: sprintId }} canEdit={canEdit} />
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

export default function SprintTaskBoard({ sprintId, sprint, canEdit, initialTasks }) {
  return (
    <TasksProvider sprintId={sprintId} departmentId={sprint?.sprint?.department_id} initialTasks={initialTasks}>
      <SprintTasksInner sprintId={sprintId} sprint={sprint} canEdit={canEdit} />
    </TasksProvider>
  )
}
