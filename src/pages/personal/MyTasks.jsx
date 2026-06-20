import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { getMyTasks } from '../../features/tasks'
import { listTaskStatuses } from '../../lib/taskStatuses'
import { getMySpaces } from '../../features/spaces'
import TaskModal from '../../features/tasks/components/TaskModal'
import KanbanBoard from '../../features/tasks/components/KanbanBoard'
import TaskListView from '../../features/tasks/components/TaskListView'
import TaskFilters from '../../features/tasks/components/TaskFilters'
import { useTaskSyncAll } from '../../features/tasks/hooks/useTaskSync'
import { getTaskTypeInfo } from '../../features/tasks/lib/task-types'

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
  const [filters, setFilters] = useState({})
  const [boardFiltersOpen, setBoardFiltersOpen] = useState(false)
  const deptMembers = useDeptMembers(profile?.department_id)

  // Real-time sync for task updates
  useTaskSyncAll(profile?.id, (updatedTask) => {
    setTasks((prev) =>
      prev.some((t) => t.id === updatedTask.id)
        ? prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
        : [updatedTask, ...prev],
    )
  })

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

  function setView(mode) {
    setViewMode(mode)
    localStorage.setItem('blw_mytasks_view', mode)
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

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== null && v !== false && (!Array.isArray(v) || v.length > 0))

  function clearFilters() {
    setFilters({})
  }

  const departmentOptions = departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))
  const memberMap = Object.fromEntries(deptMembers.map((m) => [m.id, m]))

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
                style={{
                  background: viewMode === mode ? 'white' : 'transparent',
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: viewMode === mode ? '0 1px 2px rgba(28,22,16,0.04)' : 'none',
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
        ) : viewMode === 'board' ? (
          <>
            <div className="flex items-center justify-end">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBoardFiltersOpen((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(28,22,16,0.04)]"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filter</span>
                  {hasActiveFilters ? <span className="text-[var(--accent)]">(active)</span> : null}
                </button>

                {boardFiltersOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[640px] max-w-[80vw] rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-lg)]">
                    <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={statuses} tasks={tasks} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="min-h-[520px]">
              <KanbanBoard
                filteredTasks={tasks}
                departmentId={null}
                spaceName="My Tasks"
                departments={departmentOptions}
                onTaskClick={(task) => setModal({ mode: 'edit', task })}
                canAddTask={true}
                onCreateTask={() => setModal({ mode: 'create' })}
                readOnly={false}
                showTaskTypes={true}
              />
            </div>
          </>
        ) : (
          <>
            <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={statuses} tasks={tasks} />
            <div className="min-h-[520px] rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
              <TaskListView
                tasks={tasks}
                statuses={statuses}
                departments={departmentOptions}
                canAddTask={true}
                onCreateTask={() => setModal({ mode: 'create' })}
                onTaskClick={(task) => setModal({ mode: 'edit', task })}
                onTaskStatusChange={undefined}
                people={memberMap}
                priorities={{}}
                teamMembers={Object.values(memberMap)}
              />
            </div>
          </>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          defaultStatus={modal.defaultStatus ?? ''}
          fieldSettings={{}}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  )
}
