import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const STATUS_SELECT = 'id, name, category, active, is_default, department_id, sort_order, legacy_key, is_org_status'

const CATEGORY_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const EMPTY_STATUS = {
  name: '',
  category: 'open',
  active: true,
  is_default: false,
}

function categoryTone(category) {
  switch (category) {
    case 'in_progress':
      return { dot: '#2563EB', bg: '#DBEAFE', text: '#1D4ED8' }
    case 'completed':
      return { dot: '#16A34A', bg: '#DCFCE7', text: '#166534' }
    case 'cancelled':
      return { dot: '#6B7280', bg: '#E5E7EB', text: '#4B5563' }
    default:
      return { dot: 'var(--accent)', bg: 'var(--accent-light)', text: 'var(--accent)' }
  }
}

function SortableStatusRow({
  status,
  editingId,
  draftName,
  savingId,
  onStartEdit,
  onDraftNameChange,
  onNameSave,
  onCategoryChange,
  onActiveToggle,
  onDelete,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id })
  const tone = categoryTone(status.category)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.75 : 1,
      }}
      className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-lg border border-[var(--border)] px-2 py-2 text-sm text-[var(--text-tertiary)] active:cursor-grabbing"
          aria-label={`Reorder ${status.name}`}
        >
          ⋮⋮
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ background: tone.dot }} />
          {editingId === status.id ? (
            <input
              autoFocus
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              onBlur={() => onNameSave(status)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onNameSave(status)
              }}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit(status)}
              className="truncate text-left text-sm font-medium text-[var(--text-primary)]"
            >
              {status.name}
            </button>
          )}
        </div>

        <select
          value={status.category}
          onChange={(event) => onCategoryChange(status, event.target.value)}
          disabled={savingId === status.id}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={status.active !== false}
            onChange={(event) => onActiveToggle(status, event.target.checked)}
            disabled={savingId === status.id}
          />
          Active
        </label>

        <button
          type="button"
          onClick={() => onDelete(status)}
          disabled={savingId === status.id}
          className="rounded-xl border border-[var(--coral)] px-3 py-2 text-sm font-medium text-[var(--coral-dark)] disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function SpaceStatusSettings({ departmentId, departmentName }) {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingGlobals, setUsingGlobals] = useState(false)
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [orgStatuses, setOrgStatuses] = useState([])
  const [defaultOrgStatusId, setDefaultOrgStatusId] = useState(null)
  const [disabledOrgStatusIds, setDisabledOrgStatusIds] = useState(new Set())
  const [togglingOrgId, setTogglingOrgId] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const sortedStatuses = useMemo(
    () => [...statuses].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)),
    [statuses],
  )

  async function loadStatuses() {
    setLoading(true)
    setMessage('')
    try {
      const [{ data, error }, { data: orgRows, error: orgError }, { data: disabledRows, error: disabledError }] = await Promise.all([
        supabase.from('task_status_definitions').select(STATUS_SELECT).eq('department_id', departmentId).order('sort_order'),
        supabase.from('task_status_definitions').select(STATUS_SELECT).eq('is_org_status', true).order('sort_order'),
        supabase.from('space_disabled_org_statuses').select('org_status_id').eq('department_id', departmentId),
      ])

      if (error) throw error
      if (orgError) throw orgError
      if (disabledError) throw disabledError

      const rows = data ?? []
      setStatuses(rows)
      setUsingGlobals(rows.length === 0)
      setOrgStatuses(orgRows ?? [])
      // Prefer the canonical 'to_do' legacy_key as the default org parent for new dept
      // statuses. orgRows includes inactive rows (e.g. the retired 'backlog'/"Not Started"
      // duplicate), so every candidate here must also require active, or a new custom
      // status could get parented to a status that no longer surfaces anywhere.
      const openOrg = (orgRows ?? []).find(r => r.legacy_key === 'to_do' && r.active)
        ?? [...(orgRows ?? [])].filter(r => r.active).sort((a, b) => a.sort_order - b.sort_order).find(r => r.category === 'open')
      setDefaultOrgStatusId(openOrg?.id ?? null)
      setDisabledOrgStatusIds(new Set((disabledRows ?? []).map((r) => r.org_status_id)))
    } catch (nextError) {
      setMessage(nextError.message)
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatuses()
  }, [departmentId])

  async function resequence(nextStatuses) {
    const resequenced = nextStatuses.map((status, index) => ({ ...status, sort_order: index + 1 }))
    setStatuses(resequenced)

    const { error } = await supabase.rpc('reorder_task_statuses', {
      p_status_updates: JSON.stringify(
        resequenced.map((status) => ({ id: status.id, sort_order: status.sort_order })),
      ),
    })
    if (error) throw error

    return resequenced
  }

  async function handleCustomizeSpace() {
    setSavingId('clone')
    setMessage('')
    try {
      const { error } = await supabase.rpc('clone_global_statuses_for_space', {
        p_department_id: departmentId,
      })
      if (error) throw error
      await loadStatuses()
      setMessage(`Statuses are now customized for ${departmentName}.`)
    } catch (nextError) {
      setMessage(nextError.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleNameSave(status) {
    const nextName = draftName.trim()
    setEditingId(null)

    if (!nextName || nextName === status.name) {
      setDraftName('')
      return
    }

    setSavingId(status.id)
    setMessage('')
    try {
      const { error } = await supabase
        .from('task_status_definitions')
        .update({ name: nextName })
        .eq('id', status.id)

      if (error) throw error

      const nextStatuses = sortedStatuses.map((entry) => (entry.id === status.id ? { ...entry, name: nextName } : entry))
      await resequence(nextStatuses)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setDraftName('')
      setSavingId(null)
    }
  }

  async function handleCategoryChange(status, category) {
    setSavingId(status.id)
    setMessage('')
    try {
      const { error } = await supabase
        .from('task_status_definitions')
        .update({ category })
        .eq('id', status.id)

      if (error) throw error

      const nextStatuses = sortedStatuses.map((entry) => (entry.id === status.id ? { ...entry, category } : entry))
      await resequence(nextStatuses)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setSavingId(null)
    }
  }

  async function handleActiveToggle(status, active) {
    setSavingId(status.id)
    setMessage('')
    try {
      const { error } = await supabase
        .from('task_status_definitions')
        .update({ active })
        .eq('id', status.id)

      if (error) throw error

      const nextStatuses = sortedStatuses.map((entry) => (entry.id === status.id ? { ...entry, active } : entry))
      await resequence(nextStatuses)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setSavingId(null)
    }
  }

  async function handleAddStatus() {
    setSavingId('new')
    setMessage('')
    try {
      const payload = {
        ...EMPTY_STATUS,
        name: `New Status ${sortedStatuses.length + 1}`,
        department_id: departmentId,
        sort_order: sortedStatuses.length + 1,
        org_status_id: defaultOrgStatusId,
      }

      const { data, error } = await supabase
        .from('task_status_definitions')
        .insert(payload)
        .select(STATUS_SELECT)
        .single()

      if (error) throw error

      const nextStatuses = await resequence([...sortedStatuses, data])
      setEditingId(data.id)
      setDraftName(data.name)
      setStatuses(nextStatuses)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(status) {
    const confirmed = window.confirm(`Delete "${status.name}"?`)
    if (!confirmed) return

    setSavingId(status.id)
    setMessage('')

    try {
      const usageRes = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status_id', status.id)

      if (usageRes.error) throw usageRes.error
      if ((usageRes.count ?? 0) > 0) {
        setMessage('Cannot delete a status that is still used by tasks.')
        return
      }

      const { error } = await supabase.from('task_status_definitions').delete().eq('id', status.id)
      if (error) throw error

      const nextStatuses = sortedStatuses.filter((entry) => entry.id !== status.id)
      await resequence(nextStatuses)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setSavingId(null)
    }
  }

  async function handleResetToGlobalDefaults() {
    const confirmed = window.confirm(`Reset ${departmentName} back to global default statuses?`)
    if (!confirmed) return

    setSavingId('reset')
    setMessage('')

    try {
      const [{ data: localRows, error: localError }, { data: globalRows, error: globalError }, { data: usedTasks, error: taskError }] = await Promise.all([
        supabase.from('task_status_definitions').select('id, legacy_key').eq('department_id', departmentId),
        supabase.from('task_status_definitions').select('id, legacy_key').is('department_id', null),
        supabase.from('tasks').select('id, status_id').eq('department_id', departmentId).not('status_id', 'is', null),
      ])

      if (localError) throw localError
      if (globalError) throw globalError
      if (taskError) throw taskError

      const localById = new Map((localRows ?? []).map((row) => [row.id, row]))
      const globalByLegacy = new Map((globalRows ?? []).filter((row) => row.legacy_key).map((row) => [row.legacy_key, row]))
      const tasksToRemap = (usedTasks ?? []).filter((task) => localById.has(task.status_id))

      for (const task of tasksToRemap) {
        const localStatus = localById.get(task.status_id)
        const globalStatus = localStatus?.legacy_key ? globalByLegacy.get(localStatus.legacy_key) : null

        if (!globalStatus) {
          throw new Error(`Cannot reset while tasks still use custom status "${localStatus?.legacy_key ?? 'unknown'}".`)
        }

        const { error } = await supabase
          .from('tasks')
          .update({ status_id: globalStatus.id })
          .eq('id', task.id)

        if (error) throw error
      }

      const { error } = await supabase
        .from('task_status_definitions')
        .delete()
        .eq('department_id', departmentId)

      if (error) throw error

      await loadStatuses()
      setMessage('This space is now using global default statuses again.')
    } catch (nextError) {
      setMessage(nextError.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleOrgStatusToggle(orgStatusId, currentlyEnabled) {
    setTogglingOrgId(orgStatusId)
    try {
      if (currentlyEnabled) {
        // Disable: check if tasks exist with this org status (guard)
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', departmentId)
          .eq('status_id', orgStatusId)

        if (count > 0) {
          setMessage(`Cannot hide this org status — ${count} task${count === 1 ? '' : 's'} still use it in this space.`)
          return
        }
        const { error } = await supabase
          .from('space_disabled_org_statuses')
          .insert({ department_id: departmentId, org_status_id: orgStatusId })
        if (error) throw error
        setDisabledOrgStatusIds((prev) => new Set([...prev, orgStatusId]))
      } else {
        const { error } = await supabase
          .from('space_disabled_org_statuses')
          .delete()
          .eq('department_id', departmentId)
          .eq('org_status_id', orgStatusId)
        if (error) throw error
        setDisabledOrgStatusIds((prev) => { const next = new Set(prev); next.delete(orgStatusId); return next })
      }
    } catch (nextError) {
      setMessage(nextError.message)
    } finally {
      setTogglingOrgId(null)
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedStatuses.findIndex((status) => status.id === active.id)
    const newIndex = sortedStatuses.findIndex((status) => status.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    setSavingId(`order-${active.id}`)
    setMessage('')
    try {
      const moved = arrayMove(sortedStatuses, oldIndex, newIndex)
      await resequence(moved)
    } catch (nextError) {
      setMessage(nextError.message)
      await loadStatuses()
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-5 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
        Loading status settings…
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {message ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          {message}
        </div>
      ) : null}

      {usingGlobals ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="text-base font-semibold text-[var(--text-primary)]">Using global defaults</div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {departmentName} does not have custom statuses yet. Clone the global defaults to customize this space.
          </p>
          <button
            type="button"
            onClick={handleCustomizeSpace}
            disabled={savingId === 'clone'}
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {savingId === 'clone' ? 'Customizing…' : 'Customize for this space'}
          </button>
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedStatuses.map((status) => status.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {sortedStatuses.map((status) => (
                  <SortableStatusRow
                    key={status.id}
                    status={status}
                    editingId={editingId}
                    draftName={draftName}
                    savingId={savingId}
                    onStartEdit={(entry) => {
                      setEditingId(entry.id)
                      setDraftName(entry.name)
                    }}
                    onDraftNameChange={setDraftName}
                    onNameSave={handleNameSave}
                    onCategoryChange={handleCategoryChange}
                    onActiveToggle={handleActiveToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAddStatus}
              disabled={savingId === 'new'}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {savingId === 'new' ? 'Adding…' : '+ Add status'}
            </button>
            <button
              type="button"
              onClick={handleResetToGlobalDefaults}
              disabled={savingId === 'reset'}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
            >
              {savingId === 'reset' ? 'Resetting…' : 'Reset to global defaults'}
            </button>
          </div>
        </>
      )}

      {orgStatuses.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="text-base font-semibold text-[var(--text-primary)]">Org-wide status visibility</div>
          <p className="mt-1 mb-4 text-sm text-[var(--text-secondary)]">
            Toggle which canonical org statuses are visible in this space. Statuses with active tasks cannot be hidden.
          </p>
          <div className="space-y-2">
            {orgStatuses.map((os) => {
              const enabled = !disabledOrgStatusIds.has(os.id)
              const tone = categoryTone(os.category)
              return (
                <label
                  key={os.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3"
                  style={{ opacity: togglingOrgId === os.id ? 0.6 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={togglingOrgId === os.id}
                    onChange={() => handleOrgStatusToggle(os.id, enabled)}
                  />
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: tone.dot }} />
                  <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{os.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: tone.bg, color: tone.text }}
                  >
                    {os.category}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
