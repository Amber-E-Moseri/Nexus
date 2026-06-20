import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import { formatDueDate } from '../../lib/dateUtils'
import { isTaskCompleted } from '../../lib/taskStatuses'
import { PRIORITY_STYLES } from '../../lib/priorities'
import { useDndSensors } from '../../dnd'
import InlineTaskComposer from './InlineTaskComposer'
import SortableTaskRow from '../../dnd/SortableTaskRow'
import { TaskRowGhost } from '../../dnd/SortableTaskRow'

function taskMatchesStatus(task, status) {
  return task.status_id === status.id || (!task.status_id && task.status === status.legacy_key)
}

export default function TaskListView({
  tasks,
  statuses = [],
  onTaskClick,
  canAddTask = false,
  departments = [],
  defaultDepartmentId = '',
  listId = null,
  onCreateTask,
  onTaskReorder,
  onTaskStatusChange,
  people = {},
  priorities = {},
  teamMembers = [],
}) {
  const [composerStatusId, setComposerStatusId] = useState(null)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const sensors = useDndSensors()

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)),
    [tasks],
  )

  const grouped = useMemo(() => {
    const matchedIds = new Set()
    const groups = statuses.map((status) => {
      const items = sorted.filter((task) => taskMatchesStatus(task, status))
      items.forEach((task) => matchedIds.add(task.id))
      return { status, items }
    })

    const ungrouped = sorted.filter((task) => !matchedIds.has(task.id))
    if (ungrouped.length > 0) {
      groups.push({
        status: { id: 'ungrouped', name: 'Other', color: '#7A7D86', legacy_key: 'other' },
        items: ungrouped,
      })
    }

    return groups
  }, [sorted, statuses])

  function handleDragStart({ active }) {
    setActiveTaskId(active.id)
  }

  function handleDragEnd({ active, over }) {
    setActiveTaskId(null)
    if (!over) return

    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask) return

    // Find the over task
    const overTask = tasks.find((t) => t.id === over.id)
    if (!overTask) return

    const activeStatus = statuses.find((s) => taskMatchesStatus(activeTask, s))
    const overStatus = statuses.find((s) => taskMatchesStatus(overTask, s))

    // If dropped on a task in a different status, update the status
    if (activeStatus && overStatus && activeStatus.id !== overStatus.id) {
      onTaskStatusChange?.({
        taskId: activeTask.id,
        newStatus: overStatus,
      })
    } else if (activeStatus && overStatus && activeStatus.id === overStatus.id) {
      // Same status, reorder
      const statusTasks = grouped.find((g) => g.status.id === activeStatus.id)?.items || []
      const activeIndex = statusTasks.findIndex((t) => t.id === active.id)
      const overIndex = statusTasks.findIndex((t) => t.id === over.id)

      if (activeIndex !== -1 && overIndex !== -1) {
        const reordered = [...statusTasks]
        const [movedTask] = reordered.splice(activeIndex, 1)
        reordered.splice(overIndex, 0, movedTask)

        onTaskReorder?.({
          taskId: activeTask.id,
          fromIndex: activeIndex,
          toIndex: overIndex,
          statusId: activeStatus.id,
        })
      }
    }
  }

  function handleDragCancel() {
    setActiveTaskId(null)
  }

  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : null

  const allTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {grouped.map(({ status, items }) => (
          <section key={status.id} style={{ border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#FCFAF6' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                {status.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)' }}>{items.length}</span>
            </div>

            <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map((task) => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    people={people}
                    statuses={statuses}
                    priorities={priorities}
                    onClick={() => onTaskClick(task)}
                  />
                ))}
              </div>
            </SortableContext>

            {canAddTask ? (
              composerStatusId === status.id ? (
                <div style={{ padding: 16, borderTop: items.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <InlineTaskComposer
                    key={status.id}
                    compact
                    departments={departments}
                    defaultDepartmentId={defaultDepartmentId}
                    statuses={[status]}
                    listId={listId}
                    teamMembers={teamMembers}
                    onCancel={() => setComposerStatusId(null)}
                    onSubmit={async (draft) => {
                      await onCreateTask?.({
                        ...draft,
                        statusId: draft.statusId || status.id,
                      })
                      setComposerStatusId(null)
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposerStatusId(status.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    fontSize: 13,
                    color: 'var(--text-tertiary)',
                    background: 'transparent',
                    border: 'none',
                    borderTop: items.length > 0 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  + Add task
                </button>
              )
            ) : null}
          </section>
        ))}

        {grouped.every((group) => group.items.length === 0) ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No tasks match the current filters.
          </div>
        ) : null}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeTask ? <TaskRowGhost task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
