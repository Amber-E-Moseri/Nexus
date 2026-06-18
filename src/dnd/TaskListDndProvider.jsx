import { useState } from 'react'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { recalcSortOrders, useDndSensors } from '@/dnd'
import SortableTaskRow, { TaskRowGhost } from '@/dnd/SortableTaskRow.jsx'

const HEADER_COLS = [
  { label: 'Task',      flex: true  },
  { label: 'Assignees', width: 110  },
  { label: 'Priority',  width: 96   },
  { label: 'Due',       width: 90   },
  { label: 'Subtasks',  width: 70   },
]

function ListHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr) 110px 96px 90px 70px',
        alignItems: 'center',
        padding: '0 16px 0 0',
        borderBottom: '1px solid #EDE8DC',
        background: '#FCFAF6',
      }}
    >
      <div /> {/* handle column spacer */}
      {HEADER_COLS.map(({ label }) => (
        <div
          key={label}
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#9A8E7A',
            padding: '9px 0',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

export default function TaskListDndProvider({
  tasks = [],
  statuses = [],
  people = {},
  priorities,
  isMobile = false,
  onTaskClick,
  onReorder,
  groupStatusKey,
  showHeader = false,
}) {
  const sensors = useDndSensors()
  const [activeId, setActiveId] = useState(null)

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) {
      setActiveId(null)
      return
    }

    const ids = tasks.map((task) => task.id)
    const oldIndex = ids.indexOf(active.id)
    const newIndex = ids.indexOf(over.id)

    if (oldIndex === -1 || newIndex === -1) {
      setActiveId(null)
      return
    }

    // Acceptance 4/8: list reorders recalculate stable sort_order values before persistence.
    const reordered = arrayMove(tasks, oldIndex, newIndex)
    const updatedTasks = recalcSortOrders(reordered).map((task) => (
      groupStatusKey ? { ...task, status: groupStatusKey } : task
    ))

    onReorder?.({ updatedTasks })
    setActiveId(null)
  }

  const activeTask = activeId ? tasks.find((task) => task.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {showHeader && !isMobile ? <ListHeader /> : null}
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableTaskRow
            key={task.id}
            task={task}
            people={people}
            statuses={statuses}
            priorities={priorities}
            onClick={onTaskClick}
            isMobile={isMobile}
          />
        ))}
      </SortableContext>

      <DragOverlay>
        {activeTask ? (
          <TaskRowGhost
            task={activeTask}
            people={people}
            priorities={priorities}
            isMobile={isMobile}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
