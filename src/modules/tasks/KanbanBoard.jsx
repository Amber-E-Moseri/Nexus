import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { useState } from 'react'
import { useDndSensors } from '../../dnd'
import { useTasks } from './TasksContext'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'

const STATUS_CATEGORY_DOT_COLORS = {
  open: '#7A7D86',
  in_progress: '#4C2A92',
  completed: '#2D8653',
  cancelled: '#C94830',
}

function taskMatchesStatus(task, status) {
  return task.status_id === status.id || (!task.status_id && task.status === status.legacy_key)
}

function mapStatusForBoard(status) {
  return {
    ...status,
    color: STATUS_CATEGORY_DOT_COLORS[status.category] ?? status.color ?? STATUS_CATEGORY_DOT_COLORS.open,
  }
}

export default function KanbanBoard({
  onTaskClick,
  filteredTasks,
  readOnly = false,
  statusesOverride = null,
  departmentId = null,
  listId = null,
  spaceName = '',
  departments = [],
  defaultDepartmentId = '',
  onCreateTask,
}) {
  const { tasks: allTasks, moveTask, statuses } = useTasks()
  const tasks = filteredTasks ?? allTasks
  const [activeTask, setActiveTask] = useState(null)
  const [composerStatusId, setComposerStatusId] = useState(null)
  const [spaceStatuses, setSpaceStatuses] = useState([])

  useEffect(() => {
    if (statusesOverride?.length || !departmentId) return undefined

    let active = true

    supabase
      .rpc('get_space_statuses', { p_department_id: departmentId })
      .then(({ data, error }) => {
        if (error) throw error
        if (active) setSpaceStatuses(data ?? [])
      })
      .catch(() => {
        if (active) setSpaceStatuses([])
      })

    return () => {
      active = false
    }
  }, [departmentId, statusesOverride])

  const boardStatuses = useMemo(() => {
    const source = statusesOverride?.length
      ? statusesOverride
      : spaceStatuses.length
        ? spaceStatuses
        : statuses

    return source.map(mapStatusForBoard)
  }, [spaceStatuses, statuses, statusesOverride])

  const sensors = useDndSensors()

  function handleDragStart({ active }) {
    setActiveTask(allTasks.find((task) => task.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return

    const destinationStatusId = over.id
    const task = allTasks.find((item) => item.id === active.id)
    const destinationStatus = boardStatuses.find((status) => status.id === destinationStatusId) ?? null

    if (!task || !destinationStatus) return

    const isSameStatus = task.status_id === destinationStatus.id
      || (!task.status_id && task.status === destinationStatus.legacy_key)

    if (!isSameStatus) {
      moveTask(task.id, destinationStatus)
    }
  }

  function handleDragCancel() {
    setActiveTask(null)
  }

  const columns = (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        overflowY: 'visible',
        height: '100%',
        paddingBottom: 8,
        alignItems: 'flex-start',
      }}
    >
      {boardStatuses.map((status) => (
        <KanbanColumn
          key={status.id}
          status={status}
          tasks={tasks.filter((task) => taskMatchesStatus(task, status))}
          onTaskClick={onTaskClick}
          onStartAddTask={() => setComposerStatusId(status.id)}
          composer={!readOnly && composerStatusId === status.id ? (
            <InlineTaskComposer
              key={status.id}
              departments={departments}
              defaultDepartmentId={defaultDepartmentId}
              listId={listId}
              onCancel={() => setComposerStatusId(null)}
              onSubmit={async (draft) => {
                await onCreateTask?.({
                  ...draft,
                  statusId: status.id,
                })
                setComposerStatusId(null)
              }}
            />
          ) : null}
          readOnly={readOnly}
        />
      ))}
    </div>
  )

  if (readOnly) {
    return columns
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {columns}

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
