import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useDndSensors } from '../../dnd'
import { useTasks } from './TasksContext'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'
import PlainKanbanBoard from './PlainKanbanBoard'
import InlineTaskComposer from './InlineTaskComposer'

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
  teamMembers = [],
}) {
  const { tasks: allTasks, moveTask, statuses } = useTasks()
  const tasks = filteredTasks ?? allTasks
  const [activeTask, setActiveTask] = useState(null)
  const [overColumnId, setOverColumnId] = useState(null)
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

  function handleDragOver({ over }) {
    if (!over) {
      setOverColumnId(null)
      return
    }
    // If over.id is a status id, use it directly
    const directMatch = boardStatuses.find((s) => s.id === over.id)
    if (directMatch) {
      setOverColumnId(directMatch.id)
      return
    }
    // Otherwise over.id is a task id — find which status that task belongs to
    const overTask = tasks.find((t) => t.id === over.id)
    if (overTask) {
      const col = boardStatuses.find(
        (s) => s.id === overTask.status_id || s.legacy_key === overTask.status
      )
      setOverColumnId(col?.id ?? null)
    } else {
      setOverColumnId(null)
    }
  }

  function handleDragStart({ active }) {
    setActiveTask(allTasks.find((task) => task.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    const resolvedColumnId = overColumnId
    setOverColumnId(null)
    if (!over && !resolvedColumnId) return

    const task = allTasks.find((item) => item.id === active.id)
    // Try over.id as a status id first, then fall back to overColumnId
    const destinationStatus =
      boardStatuses.find((s) => s.id === over?.id) ??
      boardStatuses.find((s) => s.id === resolvedColumnId)

    if (!task || !destinationStatus) return

    const isSameStatus =
      task.status_id === destinationStatus.id ||
      (!task.status_id && task.status === destinationStatus.legacy_key)

    if (!isSameStatus) {
      moveTask(task.id, destinationStatus)
    }
  }

  function handleDragCancel() {
    setActiveTask(null)
    setOverColumnId(null)
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
              teamMembers={teamMembers}
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
          isOver={overColumnId === status.id}
        />
      ))}
    </div>
  )

  if (readOnly) {
    return (
      <PlainKanbanBoard
        filteredTasks={tasks}
        onTaskClick={onTaskClick}
        statuses={boardStatuses}
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
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
