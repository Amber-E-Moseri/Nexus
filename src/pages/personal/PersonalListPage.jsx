import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Lock, Pin, PinOff, Plus, Search, X } from 'lucide-react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { usePersonalList } from '../../features/tasks/hooks/usePersonalList'
import {
  addTaskToPersonalList,
  removeTaskFromPersonalList,
  searchPinnableTasks,
} from '../../features/tasks/lib/personalList'
import { listTaskStatuses } from '../../lib/taskStatuses'
import { formatDueDate } from '../../lib/dateUtils'
import { TasksProvider } from '../../features/tasks/TasksContext'
import TaskModal from '../../features/tasks/components/TaskModal'
import KanbanBoard from '../../features/tasks/components/KanbanBoard'
import TaskListView from '../../features/tasks/components/TaskListView'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

function loadViewMode() {
  return localStorage.getItem('blw_personal_list_view') ?? 'list'
}

// Picker for adding an existing team task to the Personal List. The task is
// not moved — pinning just gives it a second location here. RLS scopes the
// search to tasks the user can already see.
function AddExistingTaskModal({ pinnedIds, onPin, onClose }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    setSearching(true)
    const handle = setTimeout(() => {
      searchPinnableTasks(term)
        .then((rows) => {
          if (active) setResults(rows)
        })
        .catch((err) => {
          console.error('[PersonalList] Task search failed:', err)
          if (active) setResults([])
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [term])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,22,16,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
        zIndex: 70,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: '92vw',
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid var(--border-1)',
          boxShadow: '0 16px 48px rgba(28,22,16,0.22)',
          overflow: 'hidden',
          fontFamily: FONT_BODY,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>
            <Pin size={15} style={{ color: 'var(--purple-500)' }} />
            Add existing task
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
        <p style={{ margin: '0 16px 10px', fontSize: 12, color: 'var(--ink-2)' }}>
          The task stays in its original List — this just adds it to your Personal List as a second location.
        </p>
        <div style={{ position: 'relative', margin: '0 16px 12px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search tasks across your spaces…"
            style={{
              width: '100%',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              padding: '9px 12px 9px 32px',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '0 8px 12px' }}>
          {searching ? (
            <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }}>
              <LoadingSpinner label="Searching" />
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '18px 12px', fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'center' }}>
              No matching tasks found.
            </div>
          ) : (
            results.map((task) => {
              const alreadyPinned = pinnedIds.has(task.id)
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={alreadyPinned}
                  onClick={() => onPin(task)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    border: 'none',
                    borderRadius: 10,
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: alreadyPinned ? 'default' : 'pointer',
                    opacity: alreadyPinned ? 0.55 : 1,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(event) => {
                    if (!alreadyPinned) event.currentTarget.style.background = 'var(--surface-sub)'
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: task.status_definition?.color ?? '#C9C0B0',
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title}
                  </span>
                  {task.space?.name ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        flexShrink: 0,
                        color: '#FFFFFF',
                        background: `#${task.space.color ?? '4C2A92'}`,
                      }}
                    >
                      {task.space.name}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>
                    {alreadyPinned ? 'Added' : (formatDueDate(task.due_date)?.label ?? '')}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function PinnedTaskRow({ task, onOpen, onUnpin }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(task)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-1)',
        cursor: 'pointer',
        background: 'transparent',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--surface-sub)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          flexShrink: 0,
          background: task.status_definition?.color ?? '#C9C0B0',
        }}
        title={task.status_definition?.name ?? task.status}
      />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.title}
      </span>
      {task.space?.name ? (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            flexShrink: 0,
            color: '#FFFFFF',
            background: `#${task.space.color ?? '4C2A92'}`,
          }}
        >
          {task.space.name}
        </span>
      ) : null}
      {task.due_date ? (
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0 }}>{formatDueDate(task.due_date)?.label}</span>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onUnpin(task)
        }}
        aria-label={`Remove ${task.title} from Personal List`}
        title="Remove from Personal List (the task itself is untouched)"
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--ink-3)',
          display: 'flex',
          padding: 4,
          borderRadius: 6,
          flexShrink: 0,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.color = 'var(--accent-red, #C0392B)'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = 'var(--ink-3)'
        }}
      >
        <PinOff size={14} />
      </button>
    </div>
  )
}

export default function PersonalListPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { personalTasks, pinnedTasks, isLoading, refetch, moveTask } = usePersonalList(profile?.id ?? '')
  const [statuses, setStatuses] = useState([])
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [showAddExisting, setShowAddExisting] = useState(false)

  // Personal tasks always use the global (org default) status set —
  // createTask resolves their statuses with departmentId null.
  useEffect(() => {
    listTaskStatuses()
      .then(setStatuses)
      .catch((err) => console.error('[PersonalList] Failed to load statuses:', err))
  }, [])

  const pinnedIds = useMemo(() => new Set(pinnedTasks.map((task) => task.id)), [pinnedTasks])

  function setView(mode) {
    setViewMode(mode)
    localStorage.setItem('blw_personal_list_view', mode)
  }

  async function handlePin(task) {
    try {
      await addTaskToPersonalList(profile.id, task.id)
      setShowAddExisting(false)
      showToast(`Added "${task.title}" to your Personal List`)
      refetch()
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  async function handleMoveTask({ taskId, newStatus }) {
    try {
      await moveTask({ taskId, newStatus })
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  async function handleUnpin(task) {
    try {
      await removeTaskFromPersonalList(profile.id, task.id)
      showToast('Removed from Personal List')
      refetch()
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  return (
    <>
      <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Personal List
              <Lock size={16} style={{ color: 'var(--ink-3)' }} />
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
              Private to you — draft tasks, track reminders, and pull in team tasks to focus on.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddExisting(true)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
              style={{ border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)', cursor: 'pointer' }}
            >
              <Link2 size={14} />
              Add existing task
            </button>
            <button
              type="button"
              onClick={() => setModal({ mode: 'create' })}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
              style={{ border: 'none', background: 'var(--purple-700, #4C2A92)', color: '#FFFFFF', cursor: 'pointer' }}
            >
              <Plus size={14} />
              New private task
            </button>
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
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading your Personal List" />
          </div>
        ) : (
          <>
            {viewMode === 'board' ? (
              <div className="min-h-[420px]">
                <TasksProvider>
                  <KanbanBoard
                    filteredTasks={personalTasks}
                    departmentId={null}
                    spaceName="Personal List"
                    departments={[]}
                    statusesOverride={statuses}
                    onTaskClick={(task) => setModal({ mode: 'edit', task })}
                    onCreateTask={() => setModal({ mode: 'create' })}
                    onTaskStatusChange={handleMoveTask}
                  />
                </TasksProvider>
              </div>
            ) : (
              <div className="min-h-[420px] rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--card-shadow)]">
                <TaskListView
                  tasks={personalTasks}
                  statuses={statuses}
                  departments={[]}
                  canAddTask
                  onCreateTask={() => setModal({ mode: 'create' })}
                  onTaskClick={(task) => setModal({ mode: 'edit', task })}
                  onTaskStatusChange={handleMoveTask}
                  people={{}}
                  priorities={{}}
                  teamMembers={[]}
                />
              </div>
            )}

            <div className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: pinnedTasks.length > 0 ? '1px solid var(--border-1)' : 'none' }}>
                <Pin size={14} style={{ color: 'var(--purple-500)' }} />
                <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 13.5, color: 'var(--ink-1)' }}>
                  Added from Spaces
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {pinnedTasks.length > 0
                    ? `${pinnedTasks.length} task${pinnedTasks.length === 1 ? '' : 's'} — they still live in their original Lists`
                    : 'Pull in any task you can see, without moving it'}
                </span>
              </div>
              {pinnedTasks.map((task) => (
                <PinnedTaskRow
                  key={task.id}
                  task={task}
                  onOpen={(t) => setModal({ mode: 'edit', task: t })}
                  onUnpin={handleUnpin}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showAddExisting ? (
        <AddExistingTaskModal
          pinnedIds={pinnedIds}
          onPin={handlePin}
          onClose={() => setShowAddExisting(false)}
        />
      ) : null}

      {modal ? (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          isPersonal={modal.mode === 'create'}
          departmentId={modal.task?.department_id ?? undefined}
          fieldSettings={{}}
          onClose={() => setModal(null)}
          onSaved={() => refetch()}
          onDeleted={() => refetch()}
        />
      ) : null}
    </>
  )
}
