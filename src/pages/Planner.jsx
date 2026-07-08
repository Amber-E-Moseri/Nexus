import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { createTask, isDelegatedTask } from '../features/tasks/lib/tasks'
import { isTaskCancelled, isTaskCompleted, listTaskStatuses } from '../lib/taskStatuses'
import { useMyTasks, getMilestoneForTask, saveMilestone } from '../features/tasks/hooks/useMyTasks'
import { getMySpaces } from '../features/spaces'
import TaskModal from '../features/tasks/components/TaskModal'
import TaskFilters from '../features/tasks/components/TaskFilters'
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

function TaskCardBody({ task, isDelegated }) {
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
      {isDelegated && (
        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 600, color: PRIMARY }}>
          Delegated{task.assignee?.name ? ` → ${task.assignee.name}` : ''}
        </div>
      )}
    </>
  )
}

function DraggableTask({ task, onClick, isDelegated }) {
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
      <TaskCardBody task={task} isDelegated={isDelegated} />
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
  const { profile, role } = useAuth()
  const { showToast } = useToast()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  // Filter state with localStorage persistence
  const [filters, setFilters] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('planner_filters') : null
    return saved
      ? JSON.parse(saved)
      : {
          status: [],
          priority: [],
          dueDateRange: null,
          dateRange: { startDate: null, endDate: null },
          assigneeId: null,
          taskType: [],
          source: [],
          milestoneStatus: [],
          showDone: false,
          hasComments: false,
          hasDependencies: false,
        }
  })

  useEffect(() => {
    localStorage.setItem('planner_filters', JSON.stringify(filters))
  }, [filters])

  // Saved filter presets
  const [presets, setPresets] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('planner_presets') : null
    return saved ? JSON.parse(saved) : []
  })

  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    localStorage.setItem('planner_presets', JSON.stringify(presets))
  }, [presets])

  const savePreset = useCallback(() => {
    if (!presetName.trim()) return
    const newPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: JSON.parse(JSON.stringify(filters))
    }
    setPresets((prev) => [...prev, newPreset])
    setPresetName('')
  }, [presetName, filters])

  const loadPreset = useCallback((preset) => {
    setFilters(JSON.parse(JSON.stringify(preset.filters)))
  }, [])

  const deletePreset = useCallback((presetId) => {
    setPresets((prev) => prev.filter((p) => p.id !== presetId))
  }, [])

  const { tasks: allTasks, milestones, isLoading } = useMyTasks(profile?.id || '', filters)
  const [activeId, setActiveId] = useState(null)
  const [modalTask, setModalTask] = useState(null)
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false)

  // Fetch filter options
  const [spaces, setSpaces] = useState([])
  const [statuses, setStatuses] = useState([])
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (profile?.id && role) {
      Promise.all([
        getMySpaces(profile.id, role, profile.department_id),
        listTaskStatuses(),
      ])
        .then(([spacesData, statusesData]) => {
          setSpaces(spacesData.filter((s) => s.status === 'active'))
          setStatuses(statusesData)
        })
        .catch(console.error)
    }
  }, [profile?.id, role, profile?.department_id])

  useEffect(() => {
    supabase
      .from('users')
      .select('id, name')
      .then(({ data }) => setMembers(data || []))
      .catch(console.error)
  }, [])

  const hasActiveFilters = useCallback(() => {
    return filters.status.length > 0 || filters.priority.length > 0 || filters.dueDateRange || (filters.dateRange?.startDate || filters.dateRange?.endDate) || filters.assigneeId || filters.taskType.length > 0 || filters.source.length > 0 || filters.milestoneStatus?.length > 0 || filters.showDone || filters.hasComments || filters.hasDependencies
  }, [filters])

  const clearFilters = useCallback(() => {
    setFilters({
      status: [],
      priority: [],
      dueDateRange: null,
      dateRange: { startDate: null, endDate: null },
      assigneeId: null,
      taskType: [],
      source: [],
      milestoneStatus: [],
      showDone: false,
      hasComments: false,
      hasDependencies: false,
    })
  }, [])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const weekStartISO = toISODate(weekStart)
  const weekEndISO = toISODate(addDays(weekStart, 6))
  const todayISO = toISODate(new Date())

  // Backlog pool = my own no-date tasks (personal + assigned-to-me) plus tasks I
  // delegated that don't have a due date yet -- so they can be triaged and scheduled
  // from here, same as My Tasks' Delegated tab surfaces them for viewing.
  const backlog = useMemo(
    () =>
      allTasks.filter(
        (t) => !t.due_date && isActionable(t) && (t.assignee_id === profile?.id || isDelegatedTask(t, profile?.id))
      ),
    [allTasks, profile?.id]
  )
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
    const current = allTasks.find((t) => t.id === taskId)
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
        assignee_id: profile.id,
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
          <button type="button" onClick={() => setFiltersPanelOpen(!filtersPanelOpen)} style={{ ...navBtn, background: hasActiveFilters() ? 'var(--accent-light)' : undefined }} title="Filter tasks">
            <SlidersHorizontal size={16} />
            {hasActiveFilters() && (
              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 4, color: 'var(--accent)' }}>
                {filters.status.length + filters.priority.length + (filters.dueDateRange ? 1 : 0) + ((filters.dateRange?.startDate || filters.dateRange?.endDate) ? 1 : 0) + (filters.assigneeId ? 1 : 0) + filters.taskType.length + filters.source.length + (filters.showDone ? 1 : 0) + (filters.hasComments ? 1 : 0) + (filters.hasDependencies ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {filtersPanelOpen && (
        <div style={{ background: 'var(--surface-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', marginBottom: 12 }}>
          <TaskFilters
            filters={filters}
            setFilters={setFilters}
            clearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            members={members}
            statuses={statuses}
            tasks={allTasks}
          />

          {/* Preset Management */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Save Filter as Preset
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name (e.g., 'My Priority Tasks')"
                onKeyPress={(e) => e.key === 'Enter' && savePreset()}
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={savePreset}
                disabled={!presetName.trim()}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: presetName.trim() ? 'var(--accent)' : '#E5E7EB',
                  color: presetName.trim() ? 'white' : 'var(--text-tertiary)',
                  border: 'none',
                  cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save
              </button>
            </div>

            {presets.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Saved Presets
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        background: '#E0E7FF',
                        color: '#3730A3',
                        padding: '6px 10px',
                        borderRadius: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => loadPreset(preset)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit',
                          fontSize: 12,
                          fontWeight: 500,
                          padding: 0,
                        }}
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(preset.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit',
                          fontSize: 14,
                          padding: 0,
                          opacity: 0.6,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters() && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          {filters.status.length > 0 && filters.status.map((statusId) => (
            <span key={statusId} style={{ fontSize: 12, background: '#DCFCE7', color: '#166534', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Status: {statuses.find((s) => s.id === statusId)?.name}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, status: filters.status.filter((s) => s !== statusId) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          ))}
          {filters.priority.length > 0 && filters.priority.map((priority) => (
            <span key={priority} style={{ fontSize: 12, background: '#FEE2E2', color: '#991B1B', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Priority: {priority}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, priority: filters.priority.filter((p) => p !== priority) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          ))}
          {filters.dueDateRange && (
            <span style={{ fontSize: 12, background: '#DBEAFE', color: '#1E40AF', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Due: {filters.dueDateRange}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, dueDateRange: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          )}
          {filters.assigneeId && (
            <span style={{ fontSize: 12, background: '#F3E8FF', color: '#6B21A8', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Assignee: {members.find((m) => m.id === filters.assigneeId)?.name}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, assigneeId: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          )}
          {filters.taskType.length > 0 && filters.taskType.map((type) => (
            <span key={type} style={{ fontSize: 12, background: '#FEF3C7', color: '#92400E', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Type: {type}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, taskType: filters.taskType.filter((t) => t !== type) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          ))}
          {filters.source.length > 0 && filters.source.map((source) => (
            <span key={source} style={{ fontSize: 12, background: '#E0E7FF', color: '#3730A3', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Source: {source}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, source: filters.source.filter((s) => s !== source) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: 'inherit' }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            style={{ fontSize: 12, color: TEXT, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Clear all
          </button>
        </div>
      )}

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
            ) : backlog.map((t) => <DraggableTask key={t.id} task={t} onClick={setModalTask} isDelegated={isDelegatedTask(t, profile?.id)} />)}
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
                    {dayTasks.map((t) => <DraggableTask key={t.id} task={t} onClick={setModalTask} isDelegated={isDelegatedTask(t, profile?.id)} />)}
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
              <TaskCardBody task={activeTask} isDelegated={isDelegatedTask(activeTask, profile?.id)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {modalTask ? (
        <TaskModal
          mode="edit"
          task={modalTask}
          isReadOnly={true}
          allowMilestoneEdit={true}
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
