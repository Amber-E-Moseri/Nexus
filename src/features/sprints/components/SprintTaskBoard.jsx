import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { getSprintMembers } from '../lib/sprints'
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
  const [members, setMembers] = useState([])
  const [view, setView] = useState('kanban')
  const [teamView, setTeamView] = useState('all')
  const [modal, setModal] = useState(null)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)

  function handleTaskStatusChange({ taskId, newStatus }) {
    moveTask(taskId, newStatus)
  }

  // Get current user's teams in this sprint
  const getMyTeams = useCallback(() => {
    if (!sprint?.teams) return []
    return sprint.teams.filter((team) =>
      team.sprint_team_members?.some((member) => member.user_id === profile?.id),
    )
  }, [sprint, profile?.id])

  // Filter tasks for "My Team" view
  const getMyTeamTasks = useCallback(() => {
    if (!filtered) return []
    const myTeams = getMyTeams()
    const myTeamIds = myTeams.map((t) => t.id)

    return filtered.filter((task) => {
      // Show if: 1) Task assigned to me, OR 2) Task assigned to someone in my team
      return (
        task.assignee_id === profile?.id ||
        myTeamIds.some((teamId) =>
          sprint?.teams?.find((t) => t.id === teamId)?.sprint_team_members?.some((m) => m.user_id === task.assignee_id),
        )
      )
    })
  }, [filtered, sprint, profile?.id, getMyTeams])

  // Group tasks by team for "All Teams" view
  const getTasksByTeam = useMemo(() => {
    if (!filtered || !sprint?.teams) return {}

    const grouped = {}

    sprint.teams.forEach((team) => {
      grouped[team.id] = {
        team,
        tasks: filtered.filter((task) => team.sprint_team_members?.some((m) => m.user_id === task.assignee_id)),
      }
    })

    return grouped
  }, [filtered, sprint])

  useEffect(() => {
    getSprintMembers(sprintId).then(setMembers).catch(() => setMembers([]))
  }, [sprintId])

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-tertiary)]">Loading sprint tasks…</div>
  }

  if (error) {
    return <div className="p-6 text-sm text-[var(--coral-dark)]">Failed to load sprint tasks: {error}</div>
  }

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
        {view === 'kanban' && sprint?.teams && sprint.teams.length > 0 ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Team View Tabs */}
            <div className="mb-4 flex gap-2 border-b border-[var(--border)]">
              <button
                onClick={() => setTeamView('my')}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: teamView === 'my' ? '2px solid var(--accent)' : 'none',
                  color: teamView === 'my' ? 'var(--accent)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                My Team
              </button>
              <button
                onClick={() => setTeamView('all')}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: teamView === 'all' ? '2px solid var(--accent)' : 'none',
                  color: teamView === 'all' ? 'var(--accent)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                All Teams
              </button>
            </div>

            {/* Board Content */}
            <div className="flex-1 overflow-hidden">
              {teamView === 'my' ? (
                <KanbanBoard
                  filteredTasks={getMyTeamTasks()}
                  onTaskClick={(task) => setModal({ mode: 'edit', task })}
                  onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, subtasks: draft.subtasks }) : undefined}
                  readOnly={!canEdit}
                  teamMembers={members}
                />
              ) : (
                <AllTeamsBoard
                  tasks={filtered}
                  tasksByTeam={getTasksByTeam}
                  sprint={sprint}
                  currentUser={profile}
                  onTaskClick={(task) => setModal({ mode: 'edit', task })}
                  onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, subtasks: draft.subtasks }) : undefined}
                  readOnly={!canEdit}
                  teamMembers={members}
                  statuses={statuses}
                />
              )}
            </div>
          </div>
        ) : view === 'kanban' ? (
          <div className="h-full overflow-hidden">
            <KanbanBoard
              filteredTasks={filtered}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onCreateTask={canEdit ? (draft) => addTask({ title: draft.title, statusId: draft.statusId, priority: draft.priority, dueDate: draft.dueDate, assignee_id: draft.assigneeId || null, subtasks: draft.subtasks }) : undefined}
              readOnly={!canEdit}
              teamMembers={members}
            />
          </div>
        ) : view === 'list' ? (
          <div className="h-full overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
            <TaskListView
              tasks={filtered}
              statuses={statuses}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onTaskStatusChange={canEdit ? handleTaskStatusChange : undefined}
              people={Object.fromEntries(members.map((m) => [m.id, m]))}
              priorities={{}}
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
          isReadOnly={!canEdit}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}

export default function SprintTaskBoard({ sprintId, sprint, canEdit }) {
  return (
    <TasksProvider sprintId={sprintId}>
      <SprintTasksInner sprintId={sprintId} sprint={sprint} canEdit={canEdit} />
    </TasksProvider>
  )
}
