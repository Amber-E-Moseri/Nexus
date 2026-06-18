import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { useToast } from '@/context/ToastContext'
import { DragOverlayTaskCard, placeholderSortOrder, reorderInColumn, useDndSensors } from '@/dnd'
import DroppableStatusColumn from '@/dnd/DroppableStatusColumn.jsx'

function sortByOrder(tasks) {
  return [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function findColumnId({ overId, statuses, tasks }) {
  if (!overId) return null

  const overIdString = String(overId)
  if (statuses.some((status) => status.key === overIdString)) return overIdString

  const overTask = tasks.find((task) => task.id === overIdString)
  return overTask?.status ?? null
}

export default function TaskBoardDndProvider({
  tasks = [],
  statuses = [],
  people = {},
  priorities,
  columnWidth = 286,
  isMobile = false,
  onTaskClick,
  onDrop,
  onAddClick,
  adding = null,
  newTitle,
  onNewTitle,
  onAddKey,
  onAddBlur,
}) {
  const { showToast } = useToast()
  const sensors = useDndSensors()
  const [activeId, setActiveId] = useState(null)
  const [overColumnId, setOverColumnId] = useState(null)

  const tasksByStatus = useMemo(() => {
    return Object.fromEntries(
      statuses.map((status) => [status.key, sortByOrder(tasks.filter((task) => task.status === status.key))]),
    )
  }, [statuses, tasks])

  function handleDragStart({ active }) {
    setActiveId(String(active.id))
  }

  function handleDragOver({ over }) {
    setOverColumnId(findColumnId({ overId: over?.id, statuses, tasks }))
  }

  function handleDragEnd({ active, over }) {
    const nextActiveId = String(active.id)

    if (!over) {
      setActiveId(null)
      setOverColumnId(null)
      return
    }

    if (!tasks.some((task) => task.id === nextActiveId)) {
      showToast('Task not visible in current filter - drag cancelled.', { tone: 'error' })
      setActiveId(null)
      setOverColumnId(null)
      return
    }

    const activeTask = tasks.find((task) => task.id === nextActiveId)
    const targetColumnId = findColumnId({ overId: over.id, statuses, tasks })

    if (!activeTask || !targetColumnId) {
      setActiveId(null)
      setOverColumnId(null)
      return
    }

    const sourceColumnId = activeTask.status
    const sourceTasks = tasksByStatus[sourceColumnId] ?? []
    const targetTasks = tasksByStatus[targetColumnId] ?? []

    let newSortOrder = activeTask.sort_order ?? 0
    let updatedTasks = tasks

    if (sourceColumnId !== targetColumnId) {
      newSortOrder = placeholderSortOrder(targetTasks, targetTasks.length)
      updatedTasks = tasks.map((task) => (
        task.id === nextActiveId
          ? { ...task, status: targetColumnId, sort_order: newSortOrder }
          : task
      ))
    } else if (String(over.id) !== nextActiveId) {
      const reordered = reorderInColumn(sourceTasks, nextActiveId, String(over.id))
      const reorderedMap = new Map(reordered.map((task) => [task.id, task]))
      const movedTask = reorderedMap.get(nextActiveId)
      newSortOrder = movedTask?.sort_order ?? newSortOrder
      updatedTasks = tasks.map((task) => reorderedMap.get(task.id) ?? task)
    } else {
      newSortOrder = placeholderSortOrder(sourceTasks, sourceTasks.length)
      updatedTasks = tasks.map((task) => (
        task.id === nextActiveId
          ? { ...task, sort_order: newSortOrder }
          : task
      ))
    }

    onDrop?.({
      taskId: nextActiveId,
      newStatus: targetColumnId,
      newSortOrder,
      updatedTasks,
    })

    setActiveId(null)
    setOverColumnId(null)
  }

  const activeTask = activeId ? tasks.find((task) => task.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverColumnId(null)
      }}
    >
      <div
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          touchAction: 'pan-x pan-y',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowY: 'hidden',
            paddingBottom: 10,
            alignItems: 'stretch',
            height: 'calc(100vh - 232px)',
            scrollBehavior: 'smooth',
            overscrollBehavior: 'contain',
          }}
        >
          {statuses.map((column) => (
            <DroppableStatusColumn
              key={column.key}
              columnId={column.key}
              label={column.label}
              color={column.color}
              isOver={activeId !== null && overColumnId === column.key}
              tasks={tasksByStatus[column.key] ?? []}
              statuses={statuses}
              people={people}
              priorities={priorities}
              columnWidth={columnWidth}
              isMobile={isMobile}
              onTaskClick={onTaskClick}
              onAddClick={onAddClick}
              adding={adding === column.key}
              newTitle={adding === column.key ? newTitle : ''}
              onNewTitle={onNewTitle}
              onAddKey={onAddKey}
              onAddBlur={onAddBlur}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? <DragOverlayTaskCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
