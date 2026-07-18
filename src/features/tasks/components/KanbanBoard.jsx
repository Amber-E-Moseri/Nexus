import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { dedupeTaskStatuses } from '../../../lib/taskStatuses'
import { useDndSensors } from '../../../dnd'
import { useTasks } from '../TasksContext'
import { getChecklistCounts } from '../lib/checklists'
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
  const ids = status._mergedIds ?? [status.id]
  return ids.includes(task.status_id) || (!task.status_id && task.status === status.legacy_key)
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
  canCreateTask = !readOnly,
  statusesOverride = null,
  departmentId = null,
  listId = null,
  spaceName = '',
  departments = [],
  defaultDepartmentId = '',
  onCreateTask,
  onTaskStatusChange,
  teamMembers = [],
  showSubtasks = true,
}) {
  const { tasks: contextTasks, moveTask: contextMoveTask, statuses } = useTasks()
  // filteredTasks may come from a source unrelated to TasksContext (e.g. a
  // cross-department hook), so drag lookups must use it, not contextTasks —
  // contextTasks is empty whenever TasksProvider is mounted without a
  // departmentId/sprintId scope.
  const tasks = filteredTasks ?? contextTasks

  // Controlled boards (onTaskStatusChange provided) persist through the
  // caller instead of TasksContext's own moveTask.
  function persistMove(taskId, nextStatus) {
    if (onTaskStatusChange) {
      onTaskStatusChange({ taskId, newStatus: nextStatus })
    } else {
      contextMoveTask(taskId, nextStatus)
    }
  }
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

    return dedupeTaskStatuses(source.map(mapStatusForBoard))
  }, [spaceStatuses, statuses, statusesOverride])

  // Memoize task grouping by status to avoid O(n×columns) filtering on every render.
  // Prevents re-renders during drag operations and maintains stable array references for memoized KanbanColumn.
  const tasksByStatus = useMemo(() => {
    const map = {}
    boardStatuses.forEach((status) => {
      const col = tasks.filter((task) => taskMatchesStatus(task, status))
      col.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : 1
      })
      map[status.id] = col
    })
    return map
  }, [tasks, boardStatuses])

  const [checklistCounts, setChecklistCounts] = useState({})

  useEffect(() => {
    const ids = tasks.map((t) => t.id).filter(Boolean)
    if (!ids.length) { setChecklistCounts({}); return }
    getChecklistCounts(ids)
      .then(setChecklistCounts)
      .catch(() => {})
  }, [tasks])

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
        (s) => (s._mergedIds ?? [s.id]).includes(overTask.status_id) || s.legacy_key === overTask.status
      )
      setOverColumnId(col?.id ?? null)
    } else {
      setOverColumnId(null)
    }
  }

  function handleDragStart({ active }) {
    setActiveTask(tasks.find((task) => task.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    const resolvedColumnId = overColumnId
    setOverColumnId(null)
    if (!over && !resolvedColumnId) return

    const task = tasks.find((item) => item.id === active.id)
    // Try over.id as a status id first, then fall back to overColumnId
    const destinationStatus =
      boardStatuses.find((s) => s.id === over?.id) ??
      boardStatuses.find((s) => s.id === resolvedColumnId)

    if (!task || !destinationStatus) return

    const isSameStatus =
      (destinationStatus._mergedIds ?? [destinationStatus.id]).includes(task.status_id) ||
      (!task.status_id && task.status === destinationStatus.legacy_key)

    if (!isSameStatus) {
      persistMove(task.id, destinationStatus)
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
          tasks={tasksByStatus[status.id] ?? []}
          onTaskClick={onTaskClick}
          onStartAddTask={() => setComposerStatusId(status.id)}
          checklistCounts={checklistCounts}
          composer={canCreateTask && composerStatusId === status.id ? (
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
          readOnly={!canCreateTask}
          isOver={overColumnId === status.id}
          showSubtasks={showSubtasks}
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
        showSubtasks={showSubtasks}
        checklistCounts={checklistCounts}
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
        {activeTask ? <TaskCard task={activeTask} isDragging checklistCount={checklistCounts[activeTask.id] ?? null} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
