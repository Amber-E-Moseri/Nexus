import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Link2, Lock, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { usePersonalSublist } from '../../features/tasks/hooks/usePersonalSublist'
import {
  addTaskToPersonalList,
  removeTaskFromPersonalList,
  searchPinnableTasks,
} from '../../features/tasks/lib/personalList'
import { createTask } from '../../features/tasks/lib/tasks'
import { isStaleCompletedTask, isTaskCompleted, listTaskStatuses, STALE_COMPLETED_TASK_DAYS } from '../../lib/taskStatuses'
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

function CreateSublistModal({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return

    setIsCreating(true)
    try {
      await onCreate(name)
    } finally {
      setIsCreating(false)
    }
  }

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
          width: 400,
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
          <div style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>
            Create sublist
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
        <form onSubmit={handleSubmit} style={{ padding: '12px 16px 16px' }}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., This Week, Someday, Waiting On"
            style={{
              width: '100%',
              border: '1px solid var(--border-1)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
              marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                border: '1px solid var(--border-1)',
                borderRadius: 8,
                background: 'var(--surface-card)',
                color: 'var(--ink-1)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderRadius: 8,
                background: name.trim() && !isCreating ? 'var(--purple-700, #4C2A92)' : 'var(--ink-3)',
                color: '#FFFFFF',
                cursor: name.trim() && !isCreating ? 'pointer' : 'default',
                fontFamily: 'inherit',
                opacity: name.trim() && !isCreating ? 1 : 0.5,
              }}
            >
              {isCreating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
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
  const {
    sublists,
    personalTasks,
    pinnedTasks,
    isLoading,
    refetch,
    createSublist,
    deleteSublist,
    moveTask,
  } = usePersonalSublist(profile?.id ?? '')

  const [statuses, setStatuses] = useState([])
  const [modal, setModal] = useState(null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [showAddExisting, setShowAddExisting] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [showCreateSublist, setShowCreateSublist] = useState(false)
  const [selectedSublistId, setSelectedSublistId] = useState(() => {
    const stored = localStorage.getItem('blw_personal_list_selected_sublist')
    return stored || null
  })
  const filterRef = useRef(null)
  const [dateClosedFilter, setDateClosedFilter] = useState(() => {
    const fallback = { operator: 'is', rangeDays: STALE_COMPLETED_TASK_DAYS.PERSONAL }
    try {
      const stored = localStorage.getItem('blw_personal_list_date_closed_filter')
      if (!stored) return fallback
      const parsed = JSON.parse(stored)
      return {
        operator: parsed.operator === 'is_not' ? 'is_not' : 'is',
        rangeDays: parsed.rangeDays === null ? null : Number(parsed.rangeDays) || fallback.rangeDays,
      }
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('blw_personal_list_date_closed_filter', JSON.stringify(dateClosedFilter))
    } catch {
      // Ignore write failures (e.g. private browsing) — persistence is a nicety, not a requirement.
    }
  }, [dateClosedFilter])

  // Update selected sublist when sublists change
  useEffect(() => {
    if (sublists.length > 0 && !selectedSublistId) {
      // Auto-select default or first sublist
      const defaultSublist = sublists.find((s) => s.is_default)
      const firstSublist = defaultSublist || sublists[0]
      setSelectedSublistId(firstSublist.id)
    }
  }, [sublists, selectedSublistId])

  // Persist selected sublist
  useEffect(() => {
    if (selectedSublistId) {
      try {
        localStorage.setItem('blw_personal_list_selected_sublist', selectedSublistId)
      } catch {
        // Ignore write failures
      }
    }
  }, [selectedSublistId])

  useEffect(() => {
    if (!showFilterPanel) return
    function handleOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setShowFilterPanel(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showFilterPanel])

  const visiblePersonalTasks = useMemo(() => {
    if (dateClosedFilter.rangeDays === null) return personalTasks
    return personalTasks.filter((t) => {
      if (!isTaskCompleted(t)) return true
      const isOutsideRange = isStaleCompletedTask(t, dateClosedFilter.rangeDays)
      return dateClosedFilter.operator === 'is_not' ? isOutsideRange : !isOutsideRange
    })
  }, [personalTasks, dateClosedFilter])

  // Personal tasks always use the global (org default) status set —
  // createTask resolves their statuses with departmentId null.
  useEffect(() => {
    listTaskStatuses()
      .then(setStatuses)
      .catch((err) => console.error('[PersonalList] Failed to load statuses:', err))
  }, [])

  const pinnedIds = useMemo(() => new Set(pinnedTasks.map((task) => task.id)), [pinnedTasks])

  // Get tasks for selected sublist
  const selectedSublist = useMemo(
    () => sublists.find((s) => s.id === selectedSublistId),
    [sublists, selectedSublistId],
  )

  const selectedSublistTasks = useMemo(() => {
    if (!selectedSublist) return []
    // Default sublist ("All Tasks") shows every personal task regardless of sublist assignment
    if (selectedSublist.is_default) return personalTasks
    return personalTasks.filter((task) => task.personal_sublist_id === selectedSublist.id)
  }, [personalTasks, selectedSublist])

  const visibleSelectedTasks = useMemo(() => {
    if (dateClosedFilter.rangeDays === null) return selectedSublistTasks
    return selectedSublistTasks.filter((t) => {
      if (!isTaskCompleted(t)) return true
      const isOutsideRange = isStaleCompletedTask(t, dateClosedFilter.rangeDays)
      return dateClosedFilter.operator === 'is_not' ? isOutsideRange : !isOutsideRange
    })
  }, [selectedSublistTasks, dateClosedFilter])

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

  async function handleCreateTask(draft) {
    const { departmentId: _d, listId: _l, ...rest } = draft
    const taskPayload = { ...rest, is_personal: true, department_id: null, list_id: null }

    // If user created task from within a sublist view, assign it to that sublist
    if (selectedSublistId) {
      taskPayload.personal_sublist_id = selectedSublistId
    }

    await createTask(taskPayload)
    refetch()
  }

  async function handleCreateSublist(name) {
    try {
      const newSublist = await createSublist(name)
      setSelectedSublistId(newSublist.id)
      setShowCreateSublist(false)
      showToast(`Created sublist "${name}"`)
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  async function handleDeleteSublist(sublistId) {
    const sublist = sublists.find((s) => s.id === sublistId)
    if (!sublist) return

    if (sublist.is_default) {
      showToast('Cannot delete the default sublist', { tone: 'error' })
      return
    }

    if (!window.confirm(`Delete sublist "${sublist.name}"? Tasks will move to "All Tasks".`)) {
      return
    }

    try {
      await deleteSublist(sublistId)
      // Reset to first sublist if we deleted the selected one
      if (selectedSublistId === sublistId) {
        const firstRemaining = sublists.find((s) => s.id !== sublistId)
        setSelectedSublistId(firstRemaining?.id || null)
      }
      showToast('Sublist deleted')
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
            <div ref={filterRef} style={{ position: 'relative' }}>
              {/* Filter icon button — dot when non-default */}
              <button
                type="button"
                onClick={() => setShowFilterPanel((v) => !v)}
                aria-label="Filters"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  border: `1px solid ${showFilterPanel ? 'var(--purple-700)' : 'var(--border-1)'}`,
                  borderRadius: 10,
                  background: showFilterPanel ? 'var(--purple-50, #f3eeff)' : 'var(--surface-card)',
                  color: showFilterPanel ? 'var(--purple-700)' : 'var(--ink-3)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <SlidersHorizontal size={15} />
                {(dateClosedFilter.rangeDays !== 14 || dateClosedFilter.operator !== 'is') && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 5,
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: 'var(--purple-700)',
                      border: '1.5px solid var(--surface-card)',
                    }}
                  />
                )}
              </button>

              {showFilterPanel && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: 240,
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-1)',
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(28,22,16,0.12)',
                    padding: '12px 14px',
                    zIndex: 50,
                  }}
                >
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Date closed
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <select
                      value={dateClosedFilter.operator}
                      onChange={(e) => setDateClosedFilter((prev) => ({ ...prev, operator: e.target.value }))}
                      style={{ width: '100%', border: '1px solid var(--border-1)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: 'var(--surface-card)', color: 'var(--ink-1)', fontFamily: 'inherit' }}
                    >
                      <option value="is">Is</option>
                      <option value="is_not">Is not</option>
                    </select>
                    <select
                      value={dateClosedFilter.rangeDays ?? 'any'}
                      onChange={(e) => setDateClosedFilter((prev) => ({
                        ...prev,
                        rangeDays: e.target.value === 'any' ? null : Number(e.target.value),
                      }))}
                      style={{ width: '100%', border: '1px solid var(--border-1)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: 'var(--surface-card)', color: 'var(--ink-1)', fontFamily: 'inherit' }}
                    >
                      <option value="any">Any time</option>
                      <option value="7">Last 7 days</option>
                      <option value="14">Last 14 days</option>
                      <option value="30">Last 30 days</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading your Personal List" />
          </div>
        ) : (
          <>
            {/* Sublist Selector */}
            {sublists.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                {sublists.map((sublist) => (
                  <div
                    key={sublist.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: `2px solid ${selectedSublistId === sublist.id ? 'var(--purple-700)' : 'var(--border-1)'}`,
                      background:
                        selectedSublistId === sublist.id ? 'var(--purple-50, #f3eeff)' : 'var(--surface-card)',
                      cursor: 'pointer',
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSublistId(sublist.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedSublistId(sublist.id)
                      }
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: selectedSublistId === sublist.id ? 600 : 500,
                        color: selectedSublistId === sublist.id ? 'var(--purple-700)' : 'var(--ink-1)',
                      }}
                    >
                      {sublist.name}
                    </span>
                    {!sublist.is_default && selectedSublistId === sublist.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSublist(sublist.id)
                        }}
                        aria-label="Delete sublist"
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          color: 'var(--ink-3)',
                          display: 'flex',
                          padding: 2,
                          borderRadius: 4,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--accent-red, #C0392B)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--ink-3)'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowCreateSublist(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px dashed var(--border-1)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--ink-3)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-sub)'
                    e.currentTarget.style.color = 'var(--ink-1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--ink-3)'
                  }}
                >
                  <Plus size={14} />
                  Add sublist
                </button>
              </div>
            )}

            {/* Task View */}
            {viewMode === 'board' ? (
              <div className="min-h-[420px]">
                <TasksProvider>
                  <KanbanBoard
                    filteredTasks={visibleSelectedTasks}
                    departmentId={null}
                    spaceName={selectedSublist?.name || 'Personal List'}
                    departments={[]}
                    statusesOverride={statuses}
                    onTaskClick={(task) => setModal({ mode: 'edit', task })}
                    onCreateTask={handleCreateTask}
                    onTaskStatusChange={handleMoveTask}
                  />
                </TasksProvider>
              </div>
            ) : (
              <div className="min-h-[420px] rounded-[16px] border border-[var(--border-1)] bg-white p-4 shadow-[var(--card-shadow)]">
                <TaskListView
                  tasks={visibleSelectedTasks}
                  statuses={statuses}
                  departments={[]}
                  canAddTask
                  onCreateTask={handleCreateTask}
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

      {showCreateSublist ? (
        <CreateSublistModal
          onCreate={handleCreateSublist}
          onClose={() => setShowCreateSublist(false)}
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
