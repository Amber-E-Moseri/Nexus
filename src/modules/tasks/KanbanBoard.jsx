import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { useState } from 'react'
import { useTasks } from './TasksContext'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'

export default function KanbanBoard({ onTaskClick, onAddTask, filteredTasks, readOnly = false }) {
  const { tasks: allTasks, moveTask, statuses } = useTasks()
  const tasks = filteredTasks ?? allTasks
  const [activeTask, setActiveTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  function handleDragStart({ active }) {
    setActiveTask(allTasks.find((t) => t.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return
    const newStatusId = over.id
    const task = allTasks.find((t) => t.id === active.id)
    if (task && task.status_id !== newStatusId) {
      moveTask(active.id, newStatusId)
    }
  }

  function handleDragCancel() {
    setActiveTask(null)
  }

  const columns = (
    <div
      style={{
        display: 'flex', gap: 12,
        overflowX: 'auto', overflowY: 'visible',
        height: '100%', paddingBottom: 8,
        alignItems: 'flex-start',
      }}
    >
      {statuses.map((status) => (
        <KanbanColumn
          key={status.id}
          status={status}
          tasks={tasks.filter((task) => task.status_id === status.id)}
          onTaskClick={onTaskClick}
          onAddTask={onAddTask}
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
