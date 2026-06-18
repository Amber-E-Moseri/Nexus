import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  endOfWeek,
  isAfter,
  isBefore,
  isEqual,
  nextMonday,
  nextSunday,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { formatDueDate } from '../../lib/dateUtils'
import { getMyTasks } from '../../lib/tasks'
import { isTaskCompleted } from '../../lib/taskStatuses'
import TaskListView from '../../modules/tasks/TaskListView'
import TaskModal from '../../modules/tasks/TaskModal'

const BOARD_VIEWS = ['Today', 'This Week', 'Upcoming', 'Overdue', 'All']

const PRIORITY_DOT = {
  urgent: '#C94830',
  high: '#E8762B',
  medium: '#4C2A92',
  low: '#6B7280',
}

function parseDue(task) {
  return task.due_date ? parseISO(`${task.due_date}T00:00:00`) : null
}

function buildGroups(tasks, today) {
  const tomorrow = addDays(today, 1)
  const endThisWeek = startOfDay(endOfWeek(today, { weekStartsOn: 0 }))
  const startNextWeek = nextMonday(today)
  const endNextWeek = nextSunday(startNextWeek)

  const overdue = []
  const todayBucket = []
  const thisWeek = []
  const nextWeek = []
  const later = []
  const noDate = []

  for (const task of tasks) {
    if (isTaskCompleted(task)) continue
    const due = parseDue(task)
    if (!due) {
      noDate.push(task)
      continue
    }
    const d = startOfDay(due)
    if (isBefore(d, today)) {
      overdue.push(task)
    } else if (isEqual(d, today)) {
      todayBucket.push(task)
    } else if (!isAfter(d, endThisWeek)) {
      thisWeek.push(task)
    } else if (!isBefore(d, startNextWeek) && !isAfter(d, endNextWeek)) {
      nextWeek.push(task)
    } else if (isAfter(d, endNextWeek)) {
      later.push(task)
    } else {
      thisWeek.push(task)
    }
  }

  return [
    {
      key: 'overdue',
      label: 'OVERDUE',
      tasks: overdue,
      headerBg: '#FEF0ED',
      borderColor: '#C94830',
      labelColor: '#C94830',
    },
    {
      key: 'today',
      label: 'TODAY',
      tasks: todayBucket,
      headerBg: '#EDE8F8',
      borderColor: '#4C2A92',
      labelColor: '#4C2A92',
    },
    {
      key: 'thisWeek',
      label: 'THIS WEEK',
      tasks: thisWeek,
      headerBg: '#F4F1EA',
      borderColor: '#B0A89A',
      labelColor: '#5C5240',
    },
    {
      key: 'nextWeek',
      label: 'NEXT WEEK',
      tasks: nextWeek,
      headerBg: '#F4F1EA',
      borderColor: '#B0A89A',
      labelColor: '#5C5240',
    },
    {
      key: 'later',
      label: 'LATER',
      tasks: later,
      headerBg: '#F9F9F9',
      borderColor: '#D1D5DB',
      labelColor: '#6B7280',
    },
    {
      key: 'noDate',
      label: 'NO DATE',
      tasks: noDate,
      headerBg: '#F9F9F9',
      borderColor: '#D1D5DB',
      labelColor: '#9CA3AF',
    },
  ]
}

function filterBoardTasks(tasks, view, today, endOfCurrentWeek) {
  return tasks.filter((task) => {
    const due = parseDue(task)
    if (view === 'Today') return due ? isEqual(startOfDay(due), today) : false
    if (view === 'This Week') return due ? !isBefore(startOfDay(due), today) && !isAfter(startOfDay(due), endOfCurrentWeek) : false
    if (view === 'Upcoming') return !due || isAfter(startOfDay(due), endOfCurrentWeek)
    if (view === 'Overdue') return due ? isBefore(startOfDay(due), today) && !isTaskCompleted(task) : false
    return true
  })
}

function boardColumns(tasks) {
  return [
    { key: 'open', label: 'Open', tasks: tasks.filter((t) => t.status_category === 'open') },
    { key: 'in_progress', label: 'In Progress', tasks: tasks.filter((t) => t.status_category === 'in_progress') },
    { key: 'completed', label: 'Completed', tasks: tasks.filter((t) => t.status_category === 'completed') },
    { key: 'cancelled', label: 'Cancelled', tasks: tasks.filter((t) => t.status_category === 'cancelled') },
  ]
}

function PriorityDot({ priority }) {
  const color = PRIORITY_DOT[priority] ?? '#D1D5DB'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function SpaceChip({ department }) {
  if (!department) return null
  const bg = department.color ? `${department.color}22` : '#F4F1EA'
  const text = department.color ?? '#5C5240'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color: text,
        whiteSpace: 'nowrap',
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {department.name}
    </span>
  )
}

function AssigneeAvatars({ assignees }) {
  if (!assignees?.length) return null
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {assignees.slice(0, 3).map((a) => {
        const name = a.user?.name ?? a.name ?? '?'
        const initials = name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
        return (
          <span
            key={a.user?.id ?? name}
            title={name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#EDE8F8',
              color: '#4C2A92',
              fontSize: 9,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </span>
        )
      })}
    </div>
  )
}

function TaskRow({ task, onClick }) {
  const due = task.due_date ? formatDueDate(task.due_date) : null
  return (
    <button
      type="button"
      onClick={() => onClick(task)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 16px',
        background: 'white',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFAF9' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
    >
      <PriorityDot priority={task.priority} />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {task.title}
      </span>
      <SpaceChip department={task.department} />
      {due ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: due.isOverdue ? '#C94830' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            minWidth: 60,
            textAlign: 'right',
          }}
        >
          {due.label}
        </span>
      ) : null}
      <AssigneeAvatars assignees={task.assignees} />
    </button>
  )
}

function GroupSection({ group, collapsed, onToggle, onTaskClick }) {
  const hasAny = group.tasks.length > 0
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 16px',
          background: group.headerBg,
          borderLeft: `3px solid ${group.borderColor}`,
          border: 'none',
          borderBottom: collapsed || !hasAny ? 'none' : '1px solid var(--border)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {collapsed
          ? <ChevronRight size={13} color={group.labelColor} />
          : <ChevronDown size={13} color={group.labelColor} />}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: group.labelColor,
          }}
        >
          {group.label}
        </span>
        <span
          style={{
            marginLeft: 4,
            padding: '1px 7px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 600,
            background: `${group.borderColor}22`,
            color: group.borderColor,
          }}
        >
          {group.tasks.length}
        </span>
      </button>
      {!collapsed && hasAny && (
        <div>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </div>
      )}
      {!collapsed && !hasAny && (
        <div
          style={{
            padding: '8px 16px',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          No tasks
        </div>
      )}
    </div>
  )

}

const DEFAULT_COLLAPSED = {
  overdue: false,
  today: false,
  thisWeek: false,
  nextWeek: true,
  later: true,
  noDate: true,
}

function loadCollapsed() {
  try {
    return { ...DEFAULT_COLLAPSED, ...JSON.parse(localStorage.getItem('blw_mytasks_collapsed') ?? '{}') }
  } catch {
    return { ...DEFAULT_COLLAPSED }
  }
}

function loadView() {
  return localStorage.getItem('blw_mytasks_view') ?? 'list'
}

export default function MyTasks() {
  const { profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadView)
  const [activeView, setActiveView] = useState('Today')
  const [collapsed, setCollapsed] = useState(loadCollapsed)


  async function load() {
    if (!profile?.id) return
    setLoading(true)
    try {
      const data = await getMyTasks(profile.id)
      setTasks(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [profile?.id])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('new') === 'true') {
      setModal({ mode: 'create' })
      navigate('/my-tasks', { replace: true })
    }
  }, [location.search, navigate])

  const today = startOfDay(new Date())
  const endOfCurrentWeek = startOfDay(endOfWeek(today, { weekStartsOn: 1 }))

  const counts = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((view) => [view, filterTasksByView(tasks, view, today, endOfCurrentWeek).length]),
      ),
    [tasks, today, endOfCurrentWeek],
  )

  const visibleTasks = useMemo(
    () => filterTasksByView(tasks, activeView, today, endOfCurrentWeek),
    [tasks, activeView, today, endOfCurrentWeek],
  )

  const overdueBuckets = useMemo(
    () => overdueGroups(visibleTasks, today),
    [visibleTasks, today],
  )
  const columns = useMemo(() => boardColumns(visibleTasks), [visibleTasks])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('new') === 'true') {
      setModal({ mode: 'create' })
      navigate('/my-tasks', { replace: true })
    }
  }, [location.search, navigate])

  function setView(mode) {
    setViewMode(mode)
    localStorage.setItem('blw_mytasks_view', mode)
  }

  function toggleGroup(key) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('blw_mytasks_collapsed', JSON.stringify(next))
      return next
    })
  }

  function handleSaved(saved) {
    setTasks((prev) =>
      prev.some((task) => task.id === saved.id)
        ? prev.map((task) => (task.id === saved.id ? saved : task))
        : [saved, ...prev],
    )
  }

  function handleDeleted(taskId) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))

  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">My Work</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tasks assigned to you, grouped by time horizon.</p>
          </div>

          <div className="flex items-center gap-2 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
            {['board', 'list'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === mode ? 'white' : 'transparent',
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                {mode === 'board' ? 'Board' : 'List'}
              </button>
            ))}

          </div>

          <div className="flex items-center gap-2 rounded-[10px] bg-[var(--surface-secondary)] p-[3px]">
            {['board', 'list'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === mode ? 'white' : 'transparent',
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(20,20,43,0.1)' : 'none',
                }}
              >
                {mode === 'board' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{
                borderColor: activeView === view ? 'var(--accent)' : 'var(--border)',
                background: activeView === view ? 'var(--accent-light)' : 'white',
                color: activeView === view ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {view} ({counts[view] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading tasks" />

          </div>
        ) : viewMode === 'list' ? (
          <div
            className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]"
          >
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                collapsed={collapsed[group.key] ?? false}
                onToggle={() => toggleGroup(group.key)}
                onTaskClick={(task) => setModal({ mode: 'edit', task })}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {BOARD_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className="rounded-full border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: activeView === view ? 'var(--accent)' : 'var(--border)',
                    background: activeView === view ? 'var(--accent-light)' : 'white',
                    color: activeView === view ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {view} ({boardCounts[view] ?? 0})
                </button>
              ))}
            </div>

            {boardVisible.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white px-6 py-10 text-center text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
                No tasks for this view.
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="min-w-[280px] flex-1 rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                        {column.label}
                      </h2>
                      <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        {column.tasks.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {column.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setModal({ mode: 'edit', task })}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-left"
                        >
                          <div className="text-sm font-medium text-[var(--text-primary)]">{task.title}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            {task.due_date ? `Due ${formatDueDate(task.due_date).label}` : 'No due date'}
                          </div>
                        </button>
                      ))}
                      {column.tasks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
                          No tasks
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>

        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isPersonal={modal.isPersonal ?? false}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  )
}
