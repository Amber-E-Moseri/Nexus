import { useEffect, useMemo, useState } from 'react'
import {
  archiveTaskStatus,
  createTaskStatus,
  getTaskStatusCatalog,
  reorderTaskStatuses,
  updateTaskStatusDefinition,
} from '../../lib/taskStatuses'

const CATEGORY_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const EMPTY_DRAFT = {
  name: '',
  color: '#7A7D86',
  category: 'open',
  is_default: false,
  active: true,
}

function PreviewPill({ status }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.color }} />
      <span>{status.name}</span>
      <span className="text-[var(--text-tertiary)]">· {CATEGORY_OPTIONS.find((option) => option.value === status.category)?.label ?? status.category}</span>
    </div>
  )
}

export default function StatusManagementSection({
  role,
  profile,
  departments = [],
  forcedDepartmentId = null,
  hideScopePicker = false,
  title = 'Status Management',
  description = 'Configure workflow columns by department. Tasks store status ids, while reporting runs off status categories.',
}) {
  const canManage = role === 'super_admin' || role === 'dept_lead'
  const isSuperAdmin = role === 'super_admin'
  const initialScope = forcedDepartmentId ?? (isSuperAdmin ? profile?.department_id ?? '__global__' : profile?.department_id ?? '__global__')
  const [selectedScope, setSelectedScope] = useState(initialScope)
  const [statuses, setStatuses] = useState([])
  const [usageCounts, setUsageCounts] = useState({})
  const [drafts, setDrafts] = useState([])
  const [newStatus, setNewStatus] = useState(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')

  const scopeDepartmentId = selectedScope === '__global__' ? null : selectedScope
  const selectedDepartmentName = selectedScope === '__global__'
    ? 'Global workflow'
    : departments.find((department) => department.id === selectedScope)?.name ?? 'Department workflow'

  useEffect(() => {
    if (forcedDepartmentId) {
      setSelectedScope(forcedDepartmentId)
      return
    }
    if (!selectedScope && departments[0]?.id) {
      setSelectedScope(departments[0].id)
    }
  }, [departments, forcedDepartmentId, selectedScope])

  async function loadCatalog() {
    setLoading(true)
    setMessage('')
    try {
      const catalog = await getTaskStatusCatalog({ departmentId: scopeDepartmentId, includeInactive: true })
      setStatuses(catalog.statuses)
      setDrafts(catalog.statuses)
      setUsageCounts(catalog.usageCounts)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalog()
  }, [scopeDepartmentId])

  const activePreview = useMemo(
    () => drafts.filter((status) => status.active !== false).sort((left, right) => left.sort_order - right.sort_order),
    [drafts],
  )

  async function clearOtherDefaults(statusId = null) {
    const currentDefaultIds = drafts.filter((status) => status.is_default && status.id !== statusId).map((status) => status.id)
    await Promise.all(currentDefaultIds.map((id) => updateTaskStatusDefinition(id, { is_default: false })))
  }

  async function handleSave(status) {
    setSavingId(status.id ?? 'new')
    setMessage('')

    try {
      if (status.is_default) {
        await clearOtherDefaults(status.id ?? null)
      }

      if (status.id) {
        await updateTaskStatusDefinition(status.id, {
          name: status.name,
          color: status.color,
          category: status.category,
          is_default: status.is_default,
          active: status.active,
          sort_order: status.sort_order,
        })
      } else {
        await createTaskStatus({
          ...status,
          department_id: scopeDepartmentId,
          sort_order: drafts.length + 1,
        })
        setNewStatus(EMPTY_DRAFT)
      }

      await loadCatalog()
      setMessage('Status workflow saved.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleArchive(status) {
    if ((usageCounts[status.id] ?? 0) > 0) {
      setMessage('Move tasks out of this status before archiving it.')
      return
    }

    if (selectedScope === '__global__' && status.legacy_key) {
      setMessage('System default statuses stay active for global workflows.')
      return
    }

    setSavingId(status.id)
    try {
      await archiveTaskStatus(status.id)
      await loadCatalog()
      setMessage('Status archived.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleMove(statusId, direction) {
    const index = drafts.findIndex((status) => status.id === statusId)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || swapIndex < 0 || swapIndex >= drafts.length) return

    const next = [...drafts]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    const resequenced = next.map((status, position) => ({ ...status, sort_order: position + 1 }))
    setDrafts(resequenced)
    setSavingId(`order-${statusId}`)

    try {
      await reorderTaskStatuses(resequenced)
      await loadCatalog()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && !hideScopePicker && !forcedDepartmentId ? (
            <select
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={selectedScope}
              onChange={(event) => setSelectedScope(event.target.value)}
            >
              <option value="__global__">Global / Personal & Sprint</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
              {selectedDepartmentName}
            </div>
          )}
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)]">
          {message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Preview workflow</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activePreview.map((status) => (
            <PreviewPill key={status.id} status={status} />
          ))}
          {activePreview.length === 0 ? (
            <div className="text-sm text-[var(--text-tertiary)]">No active statuses configured.</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
            Loading statuses…
          </div>
        ) : null}

        {!loading && drafts.map((status, index) => (
          <div key={status.id} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <div className="grid gap-3 md:grid-cols-[1.4fr_140px_160px_120px_140px]">
              <input
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                value={status.name}
                disabled={!canManage}
                onChange={(event) => {
                  const next = event.target.value
                  setDrafts((current) => current.map((entry) => (entry.id === status.id ? { ...entry, name: next } : entry)))
                }}
              />
              <input
                type="color"
                className="h-[42px] rounded-xl border border-[var(--border)] px-2 py-1"
                value={status.color}
                disabled={!canManage}
                onChange={(event) => {
                  const next = event.target.value
                  setDrafts((current) => current.map((entry) => (entry.id === status.id ? { ...entry, color: next } : entry)))
                }}
              />
              <select
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                value={status.category}
                disabled={!canManage}
                onChange={(event) => {
                  const next = event.target.value
                  setDrafts((current) => current.map((entry) => (entry.id === status.id ? { ...entry, category: next } : entry)))
                }}
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
                  checked={Boolean(status.is_default)}
                  disabled={!canManage}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setDrafts((current) => current.map((entry) => ({
                      ...entry,
                      is_default: entry.id === status.id ? checked : checked ? false : entry.is_default,
                    })))
                  }}
                />
                Default
              </label>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                <span>Used by {usageCounts[status.id] ?? 0}</span>
                <span style={{ color: status.active ? 'var(--sage)' : 'var(--text-tertiary)' }}>
                  {status.active ? 'Active' : 'Archived'}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                disabled={!canManage || index === 0 || savingId === `order-${status.id}`}
                onClick={() => handleMove(status.id, 'up')}
              >
                Move up
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                disabled={!canManage || index === drafts.length - 1 || savingId === `order-${status.id}`}
                onClick={() => handleMove(status.id, 'down')}
              >
                Move down
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={savingId === status.id}
                  onClick={() => handleSave(status)}
                >
                  {savingId === status.id ? 'Saving…' : 'Save'}
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60" style={{ borderColor: 'var(--amber)', color: 'var(--amber-hover)' }}
                  disabled={
                    savingId === status.id ||
                    (usageCounts[status.id] ?? 0) > 0 ||
                    (selectedScope === '__global__' && Boolean(status.legacy_key))
                  }
                  onClick={() => handleArchive(status)}
                >
                  Archive
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Create status</div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_140px_180px_120px]">
            <input
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Requested"
              value={newStatus.name}
              onChange={(event) => setNewStatus((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              type="color"
              className="h-[42px] rounded-xl border border-[var(--border)] px-2 py-1"
              value={newStatus.color}
              onChange={(event) => setNewStatus((current) => ({ ...current, color: event.target.value }))}
            />
            <select
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={newStatus.category}
              onChange={(event) => setNewStatus((current) => ({ ...current, category: event.target.value }))}
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
                checked={newStatus.is_default}
                onChange={(event) => setNewStatus((current) => ({ ...current, is_default: event.target.checked }))}
              />
              Default
            </label>
          </div>
          <button
            type="button"
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={!newStatus.name.trim() || savingId === 'new'}
            onClick={() => handleSave(newStatus)}
          >
            {savingId === 'new' ? 'Creating…' : 'Create status'}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          You can view workflow definitions here. Status changes are managed by Super Admins and Department Leads.
        </div>
      )}
    </section>
  )
}
