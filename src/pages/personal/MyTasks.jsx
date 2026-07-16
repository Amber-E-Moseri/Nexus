import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useToast } from '../../context/ToastContext'
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
import { EMPTY_FILTERS, applyTaskFilters } from '../../features/tasks/hooks/useTaskFilters'
import { getTaskTypeInfo } from '../../features/tasks/lib/task-types'
import { isDelegatedTask, updateTask } from '../../features/tasks/lib/tasks'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

function loadViewMode() {
  return localStorage.getItem('blw_mytasks_view') ?? 'list'
}

// Sidebar quick views (/my-tasks/:view) → useMyTasks scope + header copy.
// Unknown :view values fall through to the default (unscoped) My Tasks.
const QUICK_VIEWS = {
  today: {
    scope: 'today_tomorrow',
    title: 'Today & Tomorrow',
    subtitle: 'Assigned tasks due today or tomorrow.',
  },
}

export default function MyTasks() {
  const { profile, role } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const { view } = useParams()
  const quickView = QUICK_VIEWS[view] ?? null
  const hookFilters = useMemo(
    () => (quickView ? { scope: quickView.scope } : undefined),
    [quickView],
  )
  const { tasks, isLoading, refetch, optimisticStatusUpdate } = useMyTasks(profile?.id || '', hookFilters)
  const [statuses, setStatuses] = useState([])
  const [departments, setDepartments] = useState([])
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [activeTab, setActiveTab] = useState('mine')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const deptMembers = useDeptMembers(profile?.department_id)

  // My Tasks spans every space, so equivalent statuses ("To Do", "Done") exist
  // once per department under different ids. Collapse them by name for the
  // filter chips and expand a selected chip back to its whole name group when
  // filtering, so a chip matches tasks from all spaces.
  const statusGroups = useMemo(() => {
    const idsByName = new Map()
    const display = []
    for (const status of statuses) {
      const key = (status.name ?? '').trim().toLowerCase()
      if (!idsByName.has(key)) {
        idsByName.set(key, [])
        display.push(status)
      }
      idsByName.get(key).push(status.id)
    }
    const idToGroup = {}
    for (const ids of idsByName.values()) {
      for (const id of ids) idToGroup[id] = ids
    }
    return { display, idToGroup }
  }, [statuses])

  // "Mine" = personal tasks + tasks assigned to me by others (assignee_id === me).
  // "Delegated" = tasks I created for someone else — tracked separately so
  // they don't inflate my own to-do totals.
  const myTasks = tasks.filter((t) => t.assignee_id === profile?.id)
  const delegatedTasks = tasks.filter((t) => isDelegatedTask(t, profile?.id))
  // Quick views are assignee-scoped at the query level, so the Delegated tab
  // doesn't apply — pin them to "mine".
  const effectiveTab = quickView ? 'mine' : activeTab
  const tabTasks = effectiveTab === 'delegated' ? delegatedTasks : myTasks

  // Apply the filter panel to whichever tab is showing. Status ids expand to
  // their name group first (see statusGroups above).
  const expandedFilters = filters.status.length > 0
    ? { ...filters, status: [...new Set(filters.status.flatMap((id) => statusGroups.idToGroup[id] ?? [id]))] }
    : filters
  const visibleTasks = applyTaskFilters(tabTasks, expandedFilters)

  async function loadMetadata() {
    if (!profile?.id) return
    try {
      const [spacesData] = await Promise.all([
        getMySpaces(profile.id, role, profile.department_id),
      ])
      const activeDepts = spacesData.filter((space) => space.status === 'active')
      setDepartments(activeDepts)

      // Load statuses from every department so cross-space tasks group correctly
      const statusLists = await Promise.all(
        activeDepts.map((d) => listTaskStatuses({ departmentId: d.id })),
      )
      setStatuses(statusLists.flat())
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
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, location.pathname, navigate])

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

  // Drag-and-drop status change for both List and Board views. Delegated
  // tasks are included on purpose — the modal stays read-only for them, but
  // dragging lets the delegator override status without editing other
  // fields. Realtime only re-syncs tasks assigned to me, so delegated-tab
  // moves need an explicit refetch to show up.
  async function handleTaskStatusChange({ taskId, newStatus }) {
    optimisticStatusUpdate(taskId, newStatus)
    try {
      await updateTask(taskId, {
        status: newStatus.legacy_key,
        statusId: newStatus.id,
        statusCategory: newStatus.category,
      })
    } catch (err) {
      console.error('[MyTasks] Failed to update task status:', err)
      showToast("Couldn't update that task's status. Try again.", { tone: 'error' })
      refetch()
    }
  }

  // Mirrors useTaskFilters.hasActiveFilters — a generic truthiness sweep
  // misfires on EMPTY_FILTERS' showDone:true default and dateRange object.
  const hasActiveFilters = () =>
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.assigneeId != null ||
    filters.dueDateRange != null ||
    filters.dateRange?.startDate != null ||
    filters.dateRange?.endDate != null ||
    filters.taskType.length > 0 ||
    filters.source.length > 0 ||
    filters.hasComments ||
    filters.hasDependencies ||
    !filters.showDone

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  const departmentOptions = departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))
  const memberMap = Object.fromEntries(deptMembers.map((m) => [m.id, m]))

  return (
    <>
      <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>{quickView?.title ?? 'My Tasks'}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{quickView?.subtitle ?? 'Everything assigned to you across departments and programs.'}</p>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
        {quickView ? <span /> : (
        <div className="flex items-center gap-1 p-[3px]" style={{ background: 'var(--surface-sub)', border: '1px solid var(--border-1)', borderRadius: 10, width: 'fit-content' }}>
          {[
            { id: 'mine', label: 'My Tasks', count: myTasks.length },
            { id: 'delegated', label: 'Delegated', count: delegatedTasks.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
              style={{
                background: activeTab === tab.id ? 'var(--surface-card)' : 'transparent',
                color: activeTab === tab.id ? 'var(--purple-700)' : 'var(--ink-3)',
                fontWeight: activeTab === tab.id ? 600 : 500,
                boxShadow: activeTab === tab.id ? '0 1px 2px rgba(28,22,16,0.06)' : 'none',
              }}
            >
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
        )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(28,22,16,0.04)]"
              style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)', transition: 'border-color .13s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--purple-500)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
            >
              <SlidersHorizontal size={14} />
              <span>Filter</span>
              {hasActiveFilters() ? <span style={{ color: 'var(--purple-500)' }}>(active)</span> : null}
            </button>

            {filtersOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[640px] max-w-[80vw] max-h-[70vh] overflow-y-auto rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--shadow-lg)]">
                <TaskFilters forceExpanded filters={filters} setFilters={setFilters} clearFilters={clearFilters} hasActiveFilters={hasActiveFilters} members={[]} statuses={statusGroups.display} tasks={tabTasks} />
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading tasks" />
          </div>
        ) : viewMode === 'board' ? (
          <div className="min-h-[520px]">
            <TasksProvider>
              <KanbanBoard
                filteredTasks={visibleTasks}
                departmentId={null}
                spaceName="My Tasks"
                departments={departmentOptions}
                statusesOverride={statuses}
                onTaskClick={(task) => setModal({ mode: 'edit', task, isReadOnly: effectiveTab === 'delegated' })}
                onCreateTask={() => setModal({ mode: 'create' })}
                onTaskStatusChange={handleTaskStatusChange}
                canCreateTask={effectiveTab === 'mine'}
              />
            </TasksProvider>
          </div>
        ) : (
          <div className="min-h-[520px] rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--card-shadow)]">
            <TaskListView
              tasks={visibleTasks}
              statuses={statuses}
              departments={departmentOptions}
              canAddTask={effectiveTab === 'mine'}
              onCreateTask={() => setModal({ mode: 'create' })}
              onTaskClick={(task) => setModal({ mode: 'edit', task, isReadOnly: effectiveTab === 'delegated' })}
              onTaskStatusChange={handleTaskStatusChange}
              people={memberMap}
              priorities={{}}
              teamMembers={Object.values(memberMap)}
            />
          </div>
        )}
      </div>

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isReadOnly={modal.isReadOnly ?? false}
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
