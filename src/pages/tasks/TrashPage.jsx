import { useMemo, useState, useCallback } from 'react'
import { Trash2, RotateCcw, X } from 'lucide-react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { useTrash } from '../../features/tasks/hooks/useTrash'
import { restoreTask, hardDeleteTask } from '../../features/tasks/lib/tasks'
import { getEffectiveRole } from '../../lib/permissions'
import { formatRelativeDate } from '../../lib/dateUtils'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'
import { useQueryClient } from '@tanstack/react-query'
import { trashTasksKey } from '../../features/tasks/hooks/useTrash'

const TRUSTED_ROLES = ['super_admin', 'regional_secretary', 'dept_lead']

function Checkbox({ checked, indeterminate, onChange, label }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate ?? false }}
      onChange={onChange}
      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent, #4C2A92)', flexShrink: 0 }}
    />
  )
}

function TrashRow({ task, selected, onToggle, onRestore, onPermanentlyDelete, canPurge }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-1)',
        background: selected ? 'var(--accent-light, #EDE8F8)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <Checkbox
        checked={selected}
        onChange={() => onToggle(task.id)}
        label={`Select "${task.title}"`}
      />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.title}
      </span>
      {task.department?.name ? (
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, flexShrink: 0, color: '#fff', background: `#${task.department.color ?? '4C2A92'}` }}>
          {task.department.name}
        </span>
      ) : null}
      <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0 }}>
        Deleted {formatRelativeDate(task.deleted_at) ?? ''}
      </span>
      <button
        type="button"
        onClick={() => onRestore(task)}
        title="Restore this task"
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-1)', background: 'var(--surface-card)', color: 'var(--ink-1)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
      >
        <RotateCcw size={13} />
        Restore
      </button>
      {canPurge ? (
        <button
          type="button"
          onClick={() => onPermanentlyDelete(task)}
          title="Permanently delete — cannot be undone"
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#C0392B', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={13} />
          Delete Forever
        </button>
      ) : null}
    </div>
  )
}

export default function TrashPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { tasks, isLoading, restore, permanentlyDelete } = useTrash()
  const queryClient = useQueryClient()
  const [spaceFilter, setSpaceFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  const canPurge = (deptId) =>
    profile ? TRUSTED_ROLES.includes(getEffectiveRole(profile, deptId)) : false

  const spaceOptions = useMemo(() => {
    const seen = new Map()
    for (const task of tasks) {
      if (task.department?.id) seen.set(task.department.id, task.department.name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])

  const filteredTasks = spaceFilter === 'all'
    ? tasks
    : tasks.filter((t) => t.department_id === spaceFilter)

  const allSelected = filteredTasks.length > 0 && filteredTasks.every((t) => selected.has(t.id))
  const someSelected = filteredTasks.some((t) => selected.has(t.id))
  const selectedInView = filteredTasks.filter((t) => selected.has(t.id))
  const anySelectedCanPurge = selectedInView.some((t) => canPurge(t.department_id))

  const toggleOne = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filteredTasks.forEach((t) => next.delete(t.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filteredTasks.forEach((t) => next.add(t.id))
        return next
      })
    }
  }

  function clearSelection() { setSelected(new Set()) }

  async function handleRestore(task) {
    try {
      await restore(task.id)
      setSelected((prev) => { const next = new Set(prev); next.delete(task.id); return next })
      showToast(`Restored "${task.title}"`)
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  async function handlePermanentlyDelete(task) {
    if (!window.confirm(`Permanently delete "${task.title}"? This cannot be undone.`)) return
    try {
      await permanentlyDelete(task.id)
      setSelected((prev) => { const next = new Set(prev); next.delete(task.id); return next })
      showToast(`Permanently deleted "${task.title}"`)
    } catch (err) {
      showToast(err.message, { tone: 'error' })
    }
  }

  async function handleBulkRestore() {
    if (selectedInView.length === 0 || bulkWorking) return
    setBulkWorking(true)
    const ids = selectedInView.map((t) => t.id)
    const results = await Promise.allSettled(ids.map((id) => restoreTask(id)))
    await queryClient.invalidateQueries({ queryKey: trashTasksKey })
    const failed = results.filter((r) => r.status === 'rejected').length
    clearSelection()
    setBulkWorking(false)
    if (failed) showToast(`Restored ${ids.length - failed} tasks (${failed} failed)`, { tone: 'warning' })
    else showToast(`Restored ${ids.length} task${ids.length !== 1 ? 's' : ''}`)
  }

  async function handleBulkDelete() {
    const purgeable = selectedInView.filter((t) => canPurge(t.department_id))
    if (purgeable.length === 0 || bulkWorking) return
    if (!window.confirm(`Permanently delete ${purgeable.length} task${purgeable.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkWorking(true)
    const results = await Promise.allSettled(purgeable.map((t) => hardDeleteTask(t.id)))
    await queryClient.invalidateQueries({ queryKey: trashTasksKey })
    const failed = results.filter((r) => r.status === 'rejected').length
    clearSelection()
    setBulkWorking(false)
    if (failed) showToast(`Deleted ${purgeable.length - failed} tasks (${failed} failed)`, { tone: 'warning' })
    else showToast(`Permanently deleted ${purgeable.length} task${purgeable.length !== 1 ? 's' : ''}`)
  }

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_BODY }}>
      <div>
        <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Trash
          <Trash2 size={16} style={{ color: 'var(--ink-3)' }} />
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
          Deleted tasks land here first. Restore them, or permanently delete if you have permission.
        </p>
      </div>

      {!isLoading && tasks.length > 0 && spaceOptions.length > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="trash-space-filter" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Space</label>
          <select
            id="trash-space-filter"
            value={spaceFilter}
            onChange={(e) => { setSpaceFilter(e.target.value); clearSelection() }}
            style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'white', color: 'var(--ink-1)' }}
          >
            <option value="all">All spaces</option>
            {spaceOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Bulk action bar */}
      {someSelected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--accent-light, #EDE8F8)',
          border: '1px solid var(--accent, #4C2A92)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent, #4C2A92)', flex: 1 }}>
            {selectedInView.length} selected
          </span>
          <button
            type="button"
            onClick={handleBulkRestore}
            disabled={bulkWorking}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'white', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: bulkWorking ? 'not-allowed' : 'pointer' }}
          >
            <RotateCcw size={13} />
            Restore all
          </button>
          {anySelectedCanPurge && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkWorking}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #C0392B', background: 'white', color: '#C0392B', fontSize: 12, fontWeight: 700, cursor: bulkWorking ? 'not-allowed' : 'pointer' }}
            >
              <X size={13} />
              Delete forever
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13 }}
          >
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading Trash" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]" style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
          Trash is empty.
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]" style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
          No deleted tasks in this space.
        </div>
      ) : (
        <div className="rounded-[16px] border border-[var(--border-1)] bg-white shadow-[var(--card-shadow)]" style={{ overflow: 'hidden' }}>
          {/* Select-all header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-app)' }}>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onChange={toggleAll}
              label="Select all tasks"
            />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)' }}>
              {filteredTasks.length} item{filteredTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
          {filteredTasks.map((task) => (
            <TrashRow
              key={task.id}
              task={task}
              selected={selected.has(task.id)}
              onToggle={toggleOne}
              onRestore={handleRestore}
              onPermanentlyDelete={handlePermanentlyDelete}
              canPurge={canPurge(task.department_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
