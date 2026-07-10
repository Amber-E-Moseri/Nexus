import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { useMyTasks } from '../tasks/hooks/useMyTasks'
import { getSubtasks } from '../tasks/lib/tasks'
import { isTaskCancelled, isTaskCompleted } from '../../lib/taskStatuses'
import TaskModal from '../tasks/components/TaskModal'
import PlannerHeader from './components/PlannerHeader'
import PlannerSidebar from './components/PlannerSidebar'
import PlannerGrid from './components/PlannerGrid'
import WarningBanner from './components/WarningBanner'
import UnlinkConfirmModal from './components/UnlinkConfirmModal'
import TimeBlockContextMenu from './components/TimeBlockContextMenu'
import { useTimeBlocks } from './hooks/useTimeBlocks'
import { computeTimeBlockWarnings, worstSeverity } from './lib/warningEngine'
import {
  addDays,
  minutesToTime,
  parseTimeToMinutes,
  startOfWeek,
  toISODate,
  MINUTES_PER_DAY,
} from './lib/timeBlockUtils'
import { BG, BORDER, TEXT } from './lib/plannerTheme'

// Stable filter object: useMyTasks re-fetches when filter identity fields
// change. We want done tasks too (for the "Done this week" KPI) and filter
// actionability ourselves.
const PLANNER_FILTERS = { showDone: true }

const isActionable = (t) => !isTaskCompleted(t) && !isTaskCancelled(t)

export default function PlannerTimeBlocking() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const userId = profile?.id ?? ''

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const weekStartISO = toISODate(weekStart)
  const weekEndISO = toISODate(addDays(weekStart, 6))
  const todayISO = toISODate(new Date())

  const { tasks, isLoading: tasksLoading } = useMyTasks(userId, PLANNER_FILTERS)
  const { timeBlocks, createTimeBlock, updateTimeBlock, deleteTimeBlock, moveParentWithChildren } =
    useTimeBlocks(userId, weekStartISO, weekEndISO)

  const [priorityFilter, setPriorityFilter] = useState(() => new Set())
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set())
  const [subtasksByParentId, setSubtasksByParentId] = useState({})
  const [modalTask, setModalTask] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)
  const [unlinkPrompt, setUnlinkPrompt] = useState(null) // { block, move }
  const [contextMenu, setContextMenu] = useState(null) // { x, y, block }
  const [dismissedWarnings, setDismissedWarnings] = useState(() => new Set())

  // ---- Task lookups -------------------------------------------------------
  const taskById = useMemo(() => {
    const map = {}
    for (const t of tasks) map[t.id] = t
    for (const subs of Object.values(subtasksByParentId)) {
      for (const s of subs) map[s.id] ??= s
    }
    return map
  }, [tasks, subtasksByParentId])

  const parents = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks])

  const matchesPriority = useCallback(
    (t) => priorityFilter.size === 0 || priorityFilter.has(t.priority ?? 'medium'),
    [priorityFilter],
  )

  const groups = useMemo(() => {
    const pool = parents.filter((t) => isActionable(t) && matchesPriority(t))
    const due = (t) => (t.due_date ? t.due_date.slice(0, 10) : null)
    const todayOverdue = pool.filter((t) => due(t) && due(t) <= todayISO)
    const thisWeek = pool.filter((t) => due(t) && due(t) > todayISO && due(t) <= weekEndISO)
    const backlog = pool.filter((t) => !due(t) || due(t) > weekEndISO)
    return [
      { name: 'Today & Overdue', tasks: todayOverdue, defaultOpen: todayOverdue.length > 0 },
      { name: 'This Week', tasks: thisWeek, defaultOpen: true },
      { name: 'Backlog', tasks: backlog, defaultOpen: true },
    ]
  }, [parents, matchesPriority, todayISO, weekEndISO])

  const scheduledTaskIds = useMemo(() => new Set(timeBlocks.map((b) => b.task_id)), [timeBlocks])

  const kpis = useMemo(() => {
    const due = (t) => (t.due_date ? t.due_date.slice(0, 10) : null)
    const actionableParents = parents.filter(isActionable)
    return {
      dueThisWeek: actionableParents.filter((t) => due(t) && due(t) >= weekStartISO && due(t) <= weekEndISO).length,
      overdue: actionableParents.filter((t) => due(t) && due(t) < todayISO).length,
      completedThisWeek: parents.filter((t) => {
        if (!isTaskCompleted(t) || !t.completed_at) return false
        const doneISO = t.completed_at.slice(0, 10)
        return doneISO >= weekStartISO && doneISO <= weekEndISO
      }).length,
      unscheduled: actionableParents.filter((t) => !scheduledTaskIds.has(t.id)).length,
    }
  }, [parents, weekStartISO, weekEndISO, todayISO, scheduledTaskIds])

  // ---- Block relationships & warnings ------------------------------------
  const childBlocksByParentBlockId = useMemo(() => {
    const map = {}
    for (const b of timeBlocks) {
      if (b.parent_time_block_id) (map[b.parent_time_block_id] ??= []).push(b)
    }
    return map
  }, [timeBlocks])

  const linkedBlockIds = useMemo(
    () => new Set(timeBlocks.filter((b) => b.parent_time_block_id).map((b) => b.id)),
    [timeBlocks],
  )

  const blockWarnings = useMemo(() => {
    const perBlock = {}
    for (const b of timeBlocks) {
      const task = taskById[b.task_id]
      if (!task) continue
      perBlock[b.id] = computeTimeBlockWarnings({
        block: b,
        task,
        subtasks: subtasksByParentId[b.task_id] ?? [],
        todayISO,
      })
    }
    return perBlock
  }, [timeBlocks, taskById, subtasksByParentId, todayISO])

  const severityByBlockId = useMemo(() => {
    const map = {}
    for (const [blockId, warnings] of Object.entries(blockWarnings)) {
      const sev = worstSeverity(warnings)
      if (sev) map[blockId] = sev
    }
    return map
  }, [blockWarnings])

  const bannerWarnings = useMemo(() => {
    const list = []
    for (const [blockId, warnings] of Object.entries(blockWarnings)) {
      if (warnings.length === 0) continue
      const w = warnings[0]
      const key = `${blockId}:${w.type}`
      if (!dismissedWarnings.has(key)) list.push({ ...w, key })
    }
    list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : b.severity === 'red' ? 1 : a.severity === 'orange' ? -1 : 1))
    return list.slice(0, 4)
  }, [blockWarnings, dismissedWarnings])

  // ---- Sidebar actions ----------------------------------------------------
  const handleToggleExpand = useCallback(
    async (task) => {
      setExpandedTaskIds((prev) => {
        const next = new Set(prev)
        if (next.has(task.id)) next.delete(task.id)
        else next.add(task.id)
        return next
      })
      if (!subtasksByParentId[task.id]) {
        try {
          const subs = await getSubtasks(task.id)
          setSubtasksByParentId((prev) => ({ ...prev, [task.id]: subs }))
        } catch (err) {
          showToast(err.message ?? 'Failed to load subtasks', { tone: 'error' })
        }
      }
    },
    [subtasksByParentId, showToast],
  )

  const handleTogglePriority = useCallback((p) => {
    setPriorityFilter((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }, [])

  // ---- Drag & drop --------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const runMutation = useCallback(
    async (fn, successMessage) => {
      try {
        await fn()
        if (successMessage) showToast(successMessage, { tone: 'success' })
      } catch (err) {
        if (err?.code === '23505') showToast('Already scheduled at that time.', { tone: 'error' })
        else showToast(err?.message ?? 'Something went wrong', { tone: 'error' })
      }
    },
    [showToast],
  )

  // If a subtask block lands inside its parent task's block (same day, start
  // within the parent's range), re-link it — no confirmation, per spec.
  const findRelinkTarget = useCallback(
    (task, dateISO, startTime) => {
      if (!task?.parent_task_id) return null
      const parentBlock = timeBlocks.find(
        (b) => b.task_id === task.parent_task_id && b.scheduled_date === dateISO && !b.is_all_day,
      )
      if (!parentBlock) return null
      const start = parseTimeToMinutes(startTime)
      if (start >= parseTimeToMinutes(parentBlock.scheduled_start_time) && start < parseTimeToMinutes(parentBlock.scheduled_end_time)) {
        return parentBlock
      }
      return null
    },
    [timeBlocks],
  )

  const handleDragEnd = useCallback(
    (event) => {
      setActiveDrag(null)
      const { active, over } = event
      if (!over) return
      const data = active.data.current
      const overId = String(over.id)

      let targetDate = null
      let targetHour = null
      let allDay = false
      if (overId.startsWith('slot:')) {
        const [, date, hour] = overId.split(':')
        targetDate = date
        targetHour = Number(hour)
      } else if (overId.startsWith('allday:')) {
        targetDate = overId.slice('allday:'.length)
        allDay = true
      } else {
        return
      }

      if (data?.type === 'task') {
        const task = data.task
        const startTime = allDay ? '00:00:00' : minutesToTime(targetHour * 60)
        const endTime = allDay ? '23:59:59' : minutesToTime(Math.min(MINUTES_PER_DAY, (targetHour + 1) * 60))
        const relinkTarget = allDay ? null : findRelinkTarget(task, targetDate, startTime)
        runMutation(() =>
          createTimeBlock({
            taskId: task.id,
            scheduledDate: targetDate,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            isAllDay: allDay,
            parentTimeBlockId: relinkTarget?.id ?? null,
            timeOffsetFromParent: relinkTarget
              ? parseTimeToMinutes(startTime) - parseTimeToMinutes(relinkTarget.scheduled_start_time)
              : null,
          }),
        )
        return
      }

      if (data?.type === 'block') {
        const block = data.block
        const duration = allDay
          ? null
          : parseTimeToMinutes(block.scheduled_end_time) - parseTimeToMinutes(block.scheduled_start_time)
        const startMin = allDay ? 0 : targetHour * 60
        const endMin = allDay ? null : Math.min(MINUTES_PER_DAY, startMin + Math.max(15, duration))
        const move = allDay
          ? { scheduled_date: targetDate, scheduled_start_time: '00:00:00', scheduled_end_time: '23:59:59', is_all_day: true }
          : {
              scheduled_date: targetDate,
              scheduled_start_time: minutesToTime(startMin),
              scheduled_end_time: minutesToTime(endMin),
              is_all_day: false,
            }

        const children = childBlocksByParentBlockId[block.id] ?? []
        if (children.length > 0 && !allDay) {
          runMutation(() =>
            moveParentWithChildren(block, children, targetDate, move.scheduled_start_time, move.scheduled_end_time),
          )
          return
        }

        if (block.parent_time_block_id) {
          // Linked subtask dragged on its own → confirm unlinking first.
          setUnlinkPrompt({ block, move })
          return
        }

        // Unlinked block: plain move, then auto re-link if it lands inside
        // its parent task's block.
        const task = taskById[block.task_id]
        const relinkTarget = allDay ? null : findRelinkTarget(task, targetDate, move.scheduled_start_time)
        runMutation(() =>
          updateTimeBlock(block.id, {
            ...move,
            parent_time_block_id: relinkTarget?.id ?? null,
            time_offset_from_parent: relinkTarget
              ? parseTimeToMinutes(move.scheduled_start_time) - parseTimeToMinutes(relinkTarget.scheduled_start_time)
              : null,
          }),
        )
      }
    },
    [childBlocksByParentBlockId, createTimeBlock, updateTimeBlock, moveParentWithChildren, findRelinkTarget, runMutation, taskById],
  )

  // ---- Block interactions --------------------------------------------------
  const handleBlockClick = useCallback(
    (block) => {
      const task = taskById[block.task_id]
      if (task) setModalTask(task)
    },
    [taskById],
  )

  const handleBlockResize = useCallback(
    (block, newEndTime) => runMutation(() => updateTimeBlock(block.id, { scheduled_end_time: newEndTime })),
    [updateTimeBlock, runMutation],
  )

  const handleBlockContextMenu = useCallback((e, block) => {
    setContextMenu({ x: e.clientX, y: e.clientY, block })
  }, [])

  // ---- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (modalTask || unlinkPrompt || contextMenu) return
      if (e.key === 'ArrowLeft') setWeekStart((w) => addDays(w, -7))
      else if (e.key === 'ArrowRight') setWeekStart((w) => addDays(w, 7))
      else if (e.key === 't' || e.key === 'T') setWeekStart(startOfWeek(new Date()))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalTask, unlinkPrompt, contextMenu])

  const dragTask = activeDrag?.type === 'task' ? activeDrag.task : activeDrag?.type === 'block' ? taskById[activeDrag.block.task_id] : null

  return (
    <div style={{ padding: '18px 22px', background: BG, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <PlannerHeader weekStart={weekStart} onWeekChange={setWeekStart} />
      <WarningBanner warnings={bannerWarnings} onDismiss={(key) => setDismissedWarnings((prev) => new Set(prev).add(key))} />

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveDrag(e.active.data.current)}
        onDragCancel={() => setActiveDrag(null)}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0, height: 'calc(100vh - 180px)' }}>
          <PlannerSidebar
            groups={groups}
            kpis={kpis}
            priorityFilter={priorityFilter}
            onTogglePriority={handleTogglePriority}
            expandedTaskIds={expandedTaskIds}
            subtasksByParentId={subtasksByParentId}
            scheduledTaskIds={scheduledTaskIds}
            onToggleExpand={handleToggleExpand}
            onOpenTask={setModalTask}
            departmentId={profile?.department_id}
            weekStart={weekStart}
          />
          <PlannerGrid
            weekStart={weekStart}
            timeBlocks={timeBlocks}
            taskById={taskById}
            severityByBlockId={severityByBlockId}
            linkedBlockIds={linkedBlockIds}
            onBlockClick={handleBlockClick}
            onBlockContextMenu={handleBlockContextMenu}
            onBlockResize={handleBlockResize}
          />
        </div>

        <DragOverlay dropAnimation={null}>
          {dragTask ? (
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 600, color: TEXT, boxShadow: '0 6px 18px rgba(28,22,16,.18)', width: 200 }}>
              {dragTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {tasksLoading && <div style={{ position: 'fixed', bottom: 16, right: 20, fontSize: 11.5, color: '#9E9488' }}>Loading tasks…</div>}

      {unlinkPrompt && (
        <UnlinkConfirmModal
          subtaskTitle={taskById[unlinkPrompt.block.task_id]?.title ?? 'Subtask'}
          parentTitle={(() => {
            const parentBlock = timeBlocks.find((b) => b.id === unlinkPrompt.block.parent_time_block_id)
            return taskById[parentBlock?.task_id]?.title ?? 'parent task'
          })()}
          onUnlink={() => {
            const { block, move } = unlinkPrompt
            setUnlinkPrompt(null)
            runMutation(() =>
              updateTimeBlock(block.id, { ...move, parent_time_block_id: null, time_offset_from_parent: null }),
            )
          }}
          onKeepLinked={() => setUnlinkPrompt(null)}
          onCancel={() => setUnlinkPrompt(null)}
        />
      )}

      {contextMenu && (
        <TimeBlockContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          block={contextMenu.block}
          onSetDuration={(block, newEnd) => runMutation(() => updateTimeBlock(block.id, { scheduled_end_time: newEnd }))}
          onDelete={(block) => runMutation(() => deleteTimeBlock(block.id), 'Removed from schedule. The task stays in your list.')}
          onClose={() => setContextMenu(null)}
        />
      )}

      {modalTask ? (
        <TaskModal
          mode="edit"
          task={modalTask}
          isReadOnly={true}
          departmentId={modalTask.department_id}
          sprintId={modalTask.sprint_id}
          onClose={() => setModalTask(null)}
          onSaved={() => setModalTask(null)}
          onDeleted={() => setModalTask(null)}
        />
      ) : null}
    </div>
  )
}
