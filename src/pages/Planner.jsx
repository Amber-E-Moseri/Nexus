import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { createTask } from '../features/tasks/lib/tasks'
import { isTaskCancelled, isTaskCompleted } from '../lib/taskStatuses'
import { useMyTasks, getMilestoneForTask, saveMilestone } from '../features/tasks/hooks/useMyTasks'
import TaskModal from '../features/tasks/components/TaskModal'
import MilestoneCreator from '../features/tasks/components/MilestoneCreator'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

const PRIORITY_DOT = { urgent: '#C94830', high: '#E8A020', medium: '#4C2A92', low: '#9E9488' }
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TASK_SELECT = `
  id, title, priority, status, status_id, due_date, created_at, department_id, assignee_id, is_personal, sprint_id,
  status_definition:task_status_definitions!status_id(id, name, color, category, legacy_key),
  space:departments(id, name, color)
`

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatRange(weekStart) {
  const end = addDays(weekStart, 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('en-CA', opts)} – ${end.toLocaleDateString('en-CA', opts)}`
}

function isActionable(task) {
  return !isTaskCompleted(task) && !isTaskCancelled(task)
}

function SpaceChip({ space }) {
  if (!space?.name) return null
  const color = space.color?.startsWith?.('#') ? space.color : `#${space.color ?? '4C2A92'}`
  return (
    <span style={{ background: `${color}20`, color, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {space.name}
    </span>
  )
}

function TaskCardBody({ task }) {
  const hasMilestone = task.milestone && task.milestone.milestone_date !== task.due_date
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <SpaceChip space={task.space} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium, flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, lineHeight: 1.35, flex: 1, minWidth: 0 }}>{task.title}</div>
        {hasMilestone && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              background: '#4C2A92',
              color: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title={`Personal target: ${new Date(task.milestone.milestone_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          >
            Target
          </span>
        )}
      </div>
    </>
  )
}

function DraggableTask({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging) onClick(task) }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: '8px 10px', marginBottom: 6, cursor: 'grab', userSelect: 'none',
        boxShadow: '0 1px 2px rgba(28,22,16,.04)',
      }}
    >
      <TaskCardBody task={task} />
    </div>
  )
}

function DayInlineAdd({ dateISO, onCreate }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const value = title.trim()
    if (!value || saving) return
    setSaving(true)
    try {
      await onCreate(value, dateISO)
      setTitle('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: MUTED, fontSize: 12, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BG }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        + Add task
      </button>
    )
  }

  return (
    <input
      autoFocus
      aria-label={`Task title for ${dateISO}`}
      value={title}
      disabled={saving}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit() }
        else if (e.key === 'Escape') { setTitle(''); setAdding(false) }
      }}
      onBlur={() => { if (title.trim()) submit(); else setAdding(false) }}
      placeholder="Task name…"
      style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${PRIMARY}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }}
    />
  )
}

function DroppableColumn({ id, children, style }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} style={{ ...style, background: isOver ? '#EDE8F8' : style.background, transition: 'background .12s' }}>
      {children}
    </div>
  )
}

function KpiTile({ label, value, accent }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', flex: 1, minWidth: 120, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ position: 'absolute', right: -18, bottom: -22, width: 70, height: 70, borderRadius: '50%', background: `${accent}14` }} />
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 26, fontWeight: 800, color: accent, marginTop: 6, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

export default function Planner() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const { tasks: allTasks, milestones, isLoading } = useMyTasks(profile?.id || '')
  const [activeId, setActiveId] = useState(null)
  const [modalTask, setModalTask] = useState(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const weekStartISO = toISODate(weekStart)
  const weekEndISO = toISODate(addDays(weekStart, 6))
  const todayISO = toISODate(new Date())

  const backlog = useMemo(() => allTasks.filter((t) => !t.due_date && isActionable(t)), [allTasks])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of allTasks) {
      if (!t.due_date || !isActionable(t)) continue
      const key = t.due_date.slice(0, 10)
      ;(map[key] ??= []).push(t)
    }
    return map
  }, [allTasks])

  const kpis = useMemo(() => {
    const inWeek = allTasks.filter((t) => t.due_date && t.due_date.slice(0, 10) >= weekStartISO && t.due_date.slice(0, 10) <= weekEndISO)
    return {
      dueThisWeek: inWeek.filter(isActionable).length,
      overdue: allTasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < todayISO && isActionable(t)).length,
      completedThisWeek: inWeek.filter((t) => isTaskCompleted(t)).length,
      noDate: backlog.length,
    }
  }, [allTasks, backlog, weekStartISO, weekEndISO, todayISO])

  async function rescheduleTask(taskId, newDue) {
    const { error } = await supabase.from('tasks').update({ due_date: newDue }).eq('id', taskId)
    if (error) {
      console.error('[planner] reschedule failed', error)
      showToast("Couldn't move that task.", { tone: 'error' })
    }
    // Real-time sync from hook will update the UI
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const taskId = active.id
    const overId = String(over.id)
    const current = tasks.find((t) => t.id === taskId)
    const newDue = overId === 'backlog' ? null : overId.startsWith('day:') ? overId.slice(4) : undefined
    if (newDue === undefined) return
    if ((current?.due_date?.slice(0, 10) ?? null) === newDue) return
    rescheduleTask(taskId, newDue)
  }

  async function handleCreate(title, dateISO) {
    try {
      await createTask({
        title,
        due_date: dateISO,
        created_by: profile.id,
        is_personal: true,
        task_type: 'personal',
        source: 'manual',
      })
      // Real-time sync from hook will update the UI
    } catch (err) {
      console.error('[planner] create failed', err)
      showToast("Couldn't create that task.", { tone: 'error' })
    }
  }

  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em' }}>My Planner</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week" style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, minWidth: 130, textAlign: 'center' }}>{formatRange(weekStart)}</span>
          <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week" style={navBtn}><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} aria-label="Go to current week" style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 700 }}>Today</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Due this week" value={kpis.dueThisWeek} accent={PRIMARY} />
        <KpiTile label="Overdue" value={kpis.overdue} accent="#C94830" />
        <KpiTile label="Completed this week" value={kpis.completedThisWeek} accent="#2D6A4F" />
        <KpiTile label="No date" value={kpis.noDate} accent={MUTED} />
      </div>

      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {/* Backlog */}
          <DroppableColumn
            id="backlog"
            style={{ flex: '0 0 280px', width: 280, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 12, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>Backlog · No date</div>
            {isLoading ? <div style={{ fontSize: 12, color: MUTED }}>Loading…</div> : backlog.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>Nothing in your backlog.</div>
            ) : backlog.map((t) => <DraggableTask key={t.id} task={t} onClick={setModalTask} />)}
          </DroppableColumn>

          {/* Week grid */}
          <div style={{ flex: 1, display: 'flex', gap: 8, overflowX: 'auto' }}>
            {days.map((day) => {
              const iso = toISODate(day)
              const isToday = iso === todayISO
              const dayTasks = tasksByDay[iso] ?? []
              return (
                <DroppableColumn
                  key={iso}
                  id={`day:${iso}`}
                  style={{ flex: 1, minWidth: 150, background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 260px)' }}
                >
                  <div style={{ textAlign: 'center', padding: '6px 4px 10px', borderRadius: 8, marginBottom: 6, background: isToday ? PRIMARY : 'transparent', color: isToday ? '#fff' : TEXT }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', opacity: isToday ? 0.85 : 0.6 }}>{DAY_NAMES[day.getDay()]}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{day.getDate()}</div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 24 }}>
                    {dayTasks.map((t) => <DraggableTask key={t.id} task={t} onClick={setModalTask} />)}
                  </div>
                  <DayInlineAdd dateISO={iso} onCreate={handleCreate} />
                </DroppableColumn>
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {activeTask ? (
            <div style={{ width: 240, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 16px 40px rgba(28,22,16,.18)' }}>
              <TaskCardBody task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {modalTask ? (
        <TaskModal
          mode="edit"
          task={modalTask}
          isReadOnly={true}
          departmentId={modalTask.department_id}
          sprintId={modalTask.sprint_id}
          onClose={() => setModalTask(null)}
          onSaved={() => { setModalTask(null) }}
          onDeleted={() => { setModalTask(null) }}
        />
      ) : null}
    </div>
  )
}

const navBtn = {
  width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, color: TEXT, cursor: 'pointer',
}
