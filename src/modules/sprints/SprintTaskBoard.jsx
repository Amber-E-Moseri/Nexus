import { useEffect, useState } from 'react'
import { getSprintMembers } from '../../lib/sprints'
import KanbanBoard from '../tasks/KanbanBoard'
import TaskFilters from '../tasks/TaskFilters'
import TaskListView from '../tasks/TaskListView'
import TaskModal from '../tasks/TaskModal'
import { TasksProvider, useTasks } from '../tasks/TasksContext'
import { useTaskFilters } from '../tasks/useTaskFilters'

function SprintTasksInner({ sprintId, canEdit }) {
  const { tasks, loading, error, statuses, defaultStatusId, moveTask } = useTasks()
  const [members, setMembers] = useState([])
  const [view, setView] = useState('kanban')
  const [modal, setModal] = useState(null)
  const { filters, setFilters, filtered, clearFilters, hasActiveFilters } = useTaskFilters(tasks)

  function handleTaskStatusChange({ taskId, newStatus }) {
    moveTask(taskId, newStatus)
  }

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
          {['kanban', 'list'].map((option) => (
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
              {option === 'kanban' ? 'Board' : 'List'}
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
        {view === 'kanban' ? (
          <div className="h-full overflow-hidden">
            <KanbanBoard
              filteredTasks={filtered}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onAddTask={canEdit ? (defaultStatus) => setModal({ mode: 'create', defaultStatus }) : undefined}
              readOnly={!canEdit}
            />
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-[16px] border border-[var(--border)] bg-white">
            <TaskListView
              tasks={filtered}
              statuses={statuses}
              onTaskClick={(task) => setModal({ mode: 'edit', task })}
              onTaskStatusChange={canEdit ? handleTaskStatusChange : undefined}
            />
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

export default function SprintTaskBoard({ sprintId, canEdit }) {
  return (
    <TasksProvider sprintId={sprintId}>
      <SprintTasksInner sprintId={sprintId} canEdit={canEdit} />
    </TasksProvider>
  )
}
