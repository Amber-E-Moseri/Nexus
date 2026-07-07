import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { useMyTasks } from '../../features/tasks/hooks/useMyTasks'
import { TasksProvider } from '../../features/tasks/TasksContext'
import { listTaskStatuses } from '../../lib/taskStatuses'
import { getMySpaces } from '../../features/spaces'
import TaskModal from '../../features/tasks/components/TaskModal'
import KanbanBoard from '../../features/tasks/components/KanbanBoard'
import TaskListView from '../../features/tasks/components/TaskListView'
import TaskFilters from '../../features/tasks/components/TaskFilters'
import { getTaskTypeInfo } from '../../features/tasks/lib/task-types'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

function loadViewMode() {
  return localStorage.getItem('blw_mytasks_view') ?? 'list'
}

export default function MyTasks() {
  const { profile, role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { tasks, isLoading, refetch } = useMyTasks(profile?.id || '')
  const [statuses, setStatuses] = useState([])
  const [departments, setDepartments] = useState([])
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [filters, setFilters] = useState({})
  const [boardFiltersOpen, setBoardFiltersOpen] = useState(false)
  const deptMembers = useDeptMembers(profile?.department_id)

  async function loadMetadata() {
    if (!profile?.id) return
    try {
      const [spacesData] = await Promise.all([
        getMySpaces(profile.id, role, profile.department_id),
      ])
      const activeDepts = spacesData.filter((space) => space.status === 'active')
      setDepartments(activeDepts)

      // Load statuses for user's primary department (or global if no department)
      // The RPC get_space_statuses() automatically returns dept-specific if they exist, else global
      const allStatuses = await listTaskStatuses({ departmentId: profile?.department_id })
      setStatuses(allStatuses)
    } catch (err) {
      console.error('[MyTasks] Failed to load metadata:', err)
    }
  }

  useEffect(() => {
    loadMetadata()
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

  function handleSaved() {
    // useMyTasks owns the task list (with realtime sync); re-pull after a
    // modal save rather than mutating a non-existent local setter.
    refetch()
  }

  function handleDeleted() {
    refetch()
  }

  const hasActiveFilters = () => Object.values(filters).some((v) => v !== undefined && v !== null && v !== false && (!Array.isArray(v) || v.length > 0))

  function clearFilters() {
    setFilters({})
  }

  const departmentOptions = departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))
  const memberMap = Object.fromEntries(deptMembers.map((m) => [m.id, m]))

  return (
    <>
      <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>My Tasks</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>Everything assigned to you across departments and programs.</p>
          </div>

          <div className="flex items-center gap-1 p-[3px]" style={{ background: 'var(--surface-sub)', border: '1px solid var(--border-1)', borderRadius: 10 }}>
            {['board', 'list'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
                style={{
                  background: viewMode === mode ? 'var(--surface-card)' : 'transparent',
                  color: viewMode === mode ? 'var(--purple-700)' : 'var(--ink-3)',
                  fontWeight: viewMode === mode ? 600 : 500,
                  boxShadow: viewMode === mode ? '0 1px 2px rgba(28,22,16,0.06)' : 'none',
                }}
              >
                {mode === 'board' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
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
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(28,22,16,0.04)]"
                  style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)', transition: 'border-color .13s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--purple-500)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
                >
                  <SlidersHorizontal size={14} />
                  <span>Filter</span>
                  {hasActiveFilters ? <span style={{ color: 'var(--purple-500)' }}>(active)</span> : null}
                </button>

                {boardFiltersOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[640px] max-w-[80vw] rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--shadow-lg)]">
                    <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={statuses} tasks={tasks} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="min-h-[520px]">
              <TasksProvider>
                <KanbanBoard
                  filteredTasks={tasks}
                  departmentId={null}
                  spaceName="My Tasks"
                  departments={departmentOptions}
                  statusesOverride={statuses}
                  onTaskClick={(task) => setModal({ mode: 'edit', task })}
                  onCreateTask={() => setModal({ mode: 'create' })}
                  readOnly={false}
                />
              </TasksProvider>
            </div>
          </>
        ) : (
          <>
            <TaskFilters filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={statuses} tasks={tasks} />
            <div className="min-h-[520px] rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--card-shadow)]">
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
          departmentId={modal.task?.department_id}
          fieldSettings={{}}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  )
}
