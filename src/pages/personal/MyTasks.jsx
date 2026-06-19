import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'

import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { formatDueDate } from '../../lib/dateUtils'
import { getMyTasks, createTask } from '../../lib/tasks'
import { listTaskStatuses } from '../../lib/taskStatuses'
import { getMySpaces } from '../../lib/spaces'
import TaskModal from '../../modules/tasks/TaskModal'
import TaskComposerModal from '../../modules/tasks/TaskComposerModal'

const PRIORITY_DOT = {
  urgent: '#C94830',
  high: '#E8762B',
  medium: '#4C2A92',
  low: '#6B7280',
}

function buildStatusGroups(tasks) {
  const notStarted = []
  const inProgress = []
  const review = []
  const completed = []

  for (const task of tasks) {
    if (task.status_category === 'completed') {
      completed.push(task)
    } else if (task.status_category === 'in_progress') {
      inProgress.push(task)
    } else if (task.status?.name?.toLowerCase().includes('review')) {
      review.push(task)
    } else {
      notStarted.push(task)
    }
  }

  return [
    {
      key: 'notStarted',
      label: 'NOT STARTED',
      tasks: notStarted,
      headerBg: '#F9F9F9',
      borderColor: '#D1D5DB',
      labelColor: '#6B7280',
      dotColor: '#9CA3AF',
    },
    {
      key: 'inProgress',
      label: 'IN PROGRESS',
      tasks: inProgress,
      headerBg: '#EDE8F8',
      borderColor: '#4C2A92',
      labelColor: '#4C2A92',
      dotColor: '#4C2A92',
    },
    {
      key: 'review',
      label: 'REVIEW',
      tasks: review,
      headerBg: '#FEF0ED',
      borderColor: '#C94830',
      labelColor: '#C94830',
      dotColor: '#F59E0B',
    },
    {
      key: 'completed',
      label: 'COMPLETED',
      tasks: completed,
      headerBg: '#F4F1EA',
      borderColor: '#B0A89A',
      labelColor: '#5C5240',
      dotColor: '#10B981',
    },
  ]
}

function buildBoardColumns(tasks) {
  return buildStatusGroups(tasks)
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
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        padding: '12px 16px',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            minWidth: 60,
          }}
        >
          {task.department?.name?.split(' ')[0] ?? 'UNASSIGNED'}
        </span>
        {task.priority && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 10,
              fontWeight: 600,
              background: PRIORITY_DOT[task.priority] ? `${PRIORITY_DOT[task.priority]}22` : '#F3F4F6',
              color: PRIORITY_DOT[task.priority] ?? '#6B7280',
            }}
          >
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
        )}
      </div>
      <span
        style={{
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AssigneeAvatars assignees={task.assignees} />
        {due ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: due.isOverdue ? '#C94830' : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {due.label}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function GroupSection({ group, collapsed, onToggle, onTaskClick, onAddTask }) {
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
          padding: '12px 16px',
          background: group.headerBg,
          borderLeft: `3px solid ${group.borderColor}`,
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
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
      {!collapsed && (
        <div>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onClick={onTaskClick} />
          ))}
          {hasAny && (
            <button
              type="button"
              onClick={() => onAddTask(group.key)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'white',
                border: 'none',
                borderTop: '1px solid var(--border)',
                color: 'var(--text-tertiary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFAF9' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
            >
              + Add task
            </button>
          )}
          {!hasAny && (
            <div
              style={{
                padding: '12px 16px',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              No tasks
            </div>
          )}
        </div>
      )}
    </div>
  )

}

const DEFAULT_COLLAPSED = {
  notStarted: false,
  inProgress: false,
  review: false,
  completed: true,
}

function loadCollapsed() {
  try {
    return { ...DEFAULT_COLLAPSED, ...JSON.parse(localStorage.getItem('blw_mytasks_collapsed') ?? '{}') }
  } catch {
    return { ...DEFAULT_COLLAPSED }
  }
}

function loadViewMode() {
  return localStorage.getItem('blw_mytasks_view') ?? 'list'
}

export default function MyTasks() {
  const { profile, role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [statuses, setStatuses] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const deptMembers = useDeptMembers(profile?.department_id)


  async function load() {
    if (!profile?.id) return
    setLoading(true)
    try {
      const [taskData, statusData, spacesData] = await Promise.all([
        getMyTasks(profile.id),
        listTaskStatuses(),
        getMySpaces(profile.id, role, profile.department_id),
      ])
      setTasks(taskData)
      setStatuses(statusData)
      setDepartments(spacesData.filter((space) => space.status === 'active'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [profile?.id, role])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('new') === 'true') {
      setModal({ mode: 'create' })
      navigate('/my-tasks', { replace: true })
    }
  }, [location.search, navigate])

  const groups = useMemo(
    () => buildStatusGroups(tasks),
    [tasks],
  )

  const columns = useMemo(
    () => buildBoardColumns(tasks),
    [tasks],
  )

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
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">My Tasks</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Everything assigned to you across departments and programs.</p>
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
                onAddTask={() => setModal({ mode: 'create' })}
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((column) => (
              <div
                key={column.key}
                className="min-w-[300px] flex-1 rounded-[24px] border border-[var(--border)] bg-white shadow-[var(--card-shadow)]"
              >
                <div className="sticky top-0 border-b border-[var(--border)] bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: column.dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                        {column.label}
                      </h2>
                    </div>
                    <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
                      {column.tasks.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  {column.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setModal({ mode: 'edit', task })}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-left transition-shadow hover:shadow-sm"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            color: '#9CA3AF',
                            textTransform: 'uppercase',
                          }}
                        >
                          {task.department?.name ?? 'UNASSIGNED'}
                        </span>
                        {task.priority && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 600,
                              background: PRIORITY_DOT[task.priority] ? `${PRIORITY_DOT[task.priority]}22` : '#F3F4F6',
                              color: PRIORITY_DOT[task.priority] ?? '#6B7280',
                            }}
                          >
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{task.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <AssigneeAvatars assignees={task.assignees} />
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {formatDueDate(task.due_date).label}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'create' })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      background: 'transparent',
                      color: 'var(--text-tertiary)',
                      border: '1px dashed var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface-secondary)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-tertiary)'
                    }}
                  >
                    + Add task
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal?.mode === 'create' ? (
        <TaskComposerModal
          open={true}
          onOpenChange={(open) => !open && setModal(null)}
          departments={departments}
          defaultDepartmentId={profile?.department_id}
          statuses={statuses}
          teamMembers={deptMembers}
          onSubmit={async (draft) => {
            await createTask(draft)
            await load()
          }}
        />
      ) : modal ? (
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
