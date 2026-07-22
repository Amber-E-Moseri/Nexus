import { DndContext, DragOverlay, closestCorners, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { getChecklistCounts } from '../lib/checklists'
import { formatDueDate } from '../../../lib/dateUtils'
import { isTaskCompleted, getTaskStatusCategory, STATUS_CATEGORIES, dedupeTaskStatuses } from '../../../lib/taskStatuses'
import { PRIORITY_STYLES } from '../../../lib/priorities'
import { useDndSensors } from '../../../dnd'
import { getTaskSubtasks } from '../lib/tasks'
import InlineTaskComposer from './InlineTaskComposer'
import SortableTaskRow from '../../../dnd/SortableTaskRow'
import { TaskRowGhost } from '../../../dnd/SortableTaskRow'

// Wraps each status section's task list in its own droppable zone. A
// SortableContext alone only registers drop targets for the items inside
// it — with zero items there's nothing to hit-test against, so dragging a
// task onto an empty status silently did nothing. minHeight keeps an empty
// section big enough to actually drop onto.
function DroppableStatusBody({ statusId, isEmpty, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId })
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: isEmpty ? 48 : undefined,
        alignItems: isEmpty ? 'center' : undefined,
        justifyContent: isEmpty ? 'center' : undefined,
        background: isOver ? 'rgba(91,52,199,0.06)' : undefined,
        transition: 'background .12s',
      }}
    >
      {isEmpty ? null : children}
    </div>
  )
}

function taskMatchesStatus(task, status) {
  // Match by status_id first (or any id merged into this status by dedupeTaskStatuses)
  const ids = status._mergedIds ?? [status.id]
  if (ids.includes(task.status_id)) return true

  // For legacy statuses without status_id, match by legacy_key
  if (!task.status_id && task.status === status.legacy_key) return true

  // For legacy statuses, also check if the status category matches
  if (!task.status_id && task.status && status.legacy_key) {
    const taskCategory = getTaskStatusCategory(task)
    return taskCategory === status.category
  }

  return false
}

const CLOSED_CATEGORIES = new Set(['completed', 'cancelled'])

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
  showSubtaskCount = true,
}) {
  const [composerStatusId, setComposerStatusId] = useState(null)
  const [activeTaskId, setActiveTaskId] = useState(null)
  // Show Completed/Cancelled sections by default so all statuses are visible;
  // the toggle below still lets users collapse them.
  const [showClosed, setShowClosed] = useState(true)
  const [checklistCounts, setChecklistCounts] = useState({})
  // Map of taskId → subtask[] for lazily-loaded subtask rows
  const [lazySubtasks, setLazySubtasks] = useState({})
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  const sensors = useDndSensors()

  const toggleSubtasks = useCallback(async (taskId) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
        return next
      }
      next.add(taskId)
      return next
    })
    if (!lazySubtasks[taskId]) {
      try {
        const children = await getTaskSubtasks(taskId)
        setLazySubtasks((prev) => ({ ...prev, [taskId]: children }))
      } catch {}
    }
  }, [lazySubtasks])

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)),
    [tasks],
  )

  // Build parent→children map: prefer lazily-fetched subtasks; fall back to
  // any subtasks that happen to be pre-loaded in the tasks prop.
  const subtasksByParent = useMemo(() => {
    const map = {}
    for (const t of sorted) {
      if (t.parent_task_id) (map[t.parent_task_id] ??= []).push(t)
    }
    // Merge lazy-fetched results — overrides the inline list for each parent
    for (const [parentId, children] of Object.entries(lazySubtasks)) {
      map[parentId] = children
    }
    return map
  }, [sorted, lazySubtasks])

  // Top-level tasks are those without a parent_task_id.
  // If all tasks are top-level (no subtasks loaded), this is a no-op.
  const topLevelIds = useMemo(() => new Set(sorted.filter((t) => !t.parent_task_id).map((t) => t.id)), [sorted])

  const dedupedStatuses = useMemo(() => dedupeTaskStatuses(statuses), [statuses])

  const grouped = useMemo(() => {
    // Only group top-level tasks; subtasks render as children beneath their parent.
    // A subtask whose parent is absent from the current view is treated as top-level
    // (orphan promotion) so it doesn't silently disappear.
    const taskIds = new Set(sorted.map((t) => t.id))
    const topLevel = sorted.filter(
      (t) => !t.parent_task_id || !taskIds.has(t.parent_task_id),
    )
    const matchedIds = new Set()
    const groups = dedupedStatuses.map((status) => {
      const items = topLevel.filter((task) => taskMatchesStatus(task, status))
      items.forEach((task) => matchedIds.add(task.id))
      return { status, items }
    })

    const ungrouped = topLevel.filter((task) => !matchedIds.has(task.id))
    if (ungrouped.length > 0) {
      groups.push({
        status: { id: 'ungrouped', name: 'Other', color: '#7A7D86', legacy_key: 'other' },
        items: ungrouped,
      })
    }

    return groups
  }, [sorted, dedupedStatuses])

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

    // Dropped directly on a status section (empty, or the section body itself
    // rather than a task row) — dedupeTaskStatuses may merge several status
    // ids into one section, so match against _mergedIds too.
    if (!overTask) {
      const targetStatus = dedupedStatuses.find(
        (s) => s.id === over.id || (s._mergedIds ?? []).includes(over.id),
      )
      if (!targetStatus) return

      const activeStatus = statuses.find((s) => taskMatchesStatus(activeTask, s))
      const isAlreadyInTarget = activeStatus
        ? activeStatus.id === targetStatus.id
        : taskMatchesStatus(activeTask, targetStatus)

      if (!isAlreadyInTarget) {
        onTaskStatusChange?.({ taskId: activeTask.id, newStatus: targetStatus })
      }
      return
    }

    const activeStatus = statuses.find((s) => taskMatchesStatus(activeTask, s))
    const overStatus = statuses.find((s) => taskMatchesStatus(overTask, s))

    // If dropped on a task in a different status, update the status
    if (overStatus && (!activeStatus || activeStatus.id !== overStatus.id)) {
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

  const allTaskIds = useMemo(() => {
    const ids = tasks.map((t) => t.id)
    for (const children of Object.values(lazySubtasks)) {
      for (const child of children) ids.push(child.id)
    }
    return ids
  }, [tasks, lazySubtasks])
  const showChecklistCount = useMemo(
    () => tasks.some((task) => (checklistCounts[task.id]?.total ?? 0) > 0),
    [checklistCounts, tasks],
  )

  useEffect(() => {
    let active = true

    if (!allTaskIds.length) {
      setChecklistCounts({})
      return undefined
    }

    getChecklistCounts(allTaskIds)
      .then((counts) => {
        if (active) setChecklistCounts(counts)
      })
      .catch((error) => {
        console.error('[TaskListView] Failed to load checklist counts:', error)
        if (active) setChecklistCounts({})
      })

    return () => {
      active = false
    }
  }, [allTaskIds])

  const closedCount = grouped
    .filter((g) => CLOSED_CATEGORIES.has(g.status.category))
    .reduce((sum, g) => sum + g.items.length, 0)

  const visibleGroups = showClosed
    ? grouped
    : grouped.filter((g) => !CLOSED_CATEGORIES.has(g.status.category))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {visibleGroups.map(({ status, items }) => (
          <section key={status.id} style={{ border: '1px solid var(--border)', borderRadius: 18, background: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#FCFAF6', borderRadius: '17px 17px 0 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                {status.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)' }}>{items.length}</span>
            </div>

            <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <DroppableStatusBody statusId={status.id} isEmpty={items.length === 0}>
                {items.map((task) => {
                  const subtaskCount = task.subtask_count ?? subtasksByParent[task.id]?.length ?? 0
                  const hasSubtasks = subtaskCount > 0
                  const isExpanded = expandedTasks.has(task.id)
                  const childSubtasks = subtasksByParent[task.id] ?? []
                  return (
                    <div key={task.id}>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        {hasSubtasks && (
                          <button
                            onClick={() => toggleSubtasks(task.id)}
                            title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                            style={{ flexShrink: 0, width: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SortableTaskRow
                            task={task}
                            people={people}
                            statuses={statuses}
                            priorities={priorities}
                            onClick={() => onTaskClick(task)}
                            showSubtaskCount={showSubtaskCount}
                            checklistCount={checklistCounts[task.id] ?? null}
                            showChecklistCount={showChecklistCount}
                          />
                        </div>
                      </div>
                      {isExpanded && childSubtasks.map((child) => (
                        <div
                          key={child.id}
                          style={{ paddingLeft: 44, background: 'var(--surface-secondary, #F9F7F3)' }}
                        >
                          <SortableTaskRow
                            task={child}
                            people={people}
                            statuses={statuses}
                            priorities={priorities}
                            onClick={() => onTaskClick(child)}
                            showSubtaskCount={false}
                            checklistCount={checklistCounts[child.id] ?? null}
                            showChecklistCount={showChecklistCount}
                            disabled
                          />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </DroppableStatusBody>
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

        {visibleGroups.every((group) => group.items.length === 0) && closedCount === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No tasks match the current filters.
          </div>
        ) : null}

        {closedCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowClosed((s) => !s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--ink-3)',
              background: 'transparent',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              transition: 'color .13s, border-color .13s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink-1)'; e.currentTarget.style.borderColor = 'var(--ink-3)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-3)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
          >
            <span style={{ fontSize: 10 }}>{showClosed ? '▲' : '▼'}</span>
            {showClosed
              ? 'Hide closed tasks'
              : `Show ${closedCount} closed task${closedCount !== 1 ? 's' : ''}`}
          </button>
        ) : null}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeTask ? <TaskRowGhost task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
