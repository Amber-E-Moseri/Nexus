import { useEffect, useState } from 'react'
import { safeHref } from '../../lib/urlUtils'
import { migrateIntegrationRow, buildSavePayload } from '../../lib/integrations/loadTransform'

const INTEGRATION_TYPES = ['foundation_school', 'zoom', 'canva', 'google_drive', 'custom']
const VISIBILITY_OPTIONS = ['all', 'super_admin', 'dept_lead', 'specific_users']
const SCOPE_OPTIONS = ['global', 'departments', 'users']

function UserSelect({ value, onChange, users, multiple = false }) {
  if (multiple) {
    const selectedIds = Array.isArray(value) ? value : (value ? [value] : [])

    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={selectedIds.length === 0}
            onChange={() => onChange([])}
            className="rounded"
          />
          All users (global)
        </label>
        {users.map((user) => (
          <label key={user.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={selectedIds.includes(user.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selectedIds, user.id])
                } else {
                  onChange(selectedIds.filter((id) => id !== user.id))
                }
              }}
              className="rounded"
            />
            {user.name || user.email}
          </label>
        ))}
      </div>
    )
  }

  return (
    <select
      className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">All users (global)</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name || user.email}
        </option>
      ))}
    </select>
  )
}

function DeptSelect({ value, onChange, departments, multiple = false }) {
  if (multiple) {
    const selectedIds = Array.isArray(value) ? value : (value ? [value] : [])

    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={selectedIds.length === 0}
            onChange={() => onChange([])}
            className="rounded"
          />
          All departments (global)
        </label>
        {departments.map((dept) => (
          <label key={dept.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={selectedIds.includes(dept.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selectedIds, dept.id])
                } else {
                  onChange(selectedIds.filter((id) => id !== dept.id))
                }
              }}
              className="rounded"
            />
            {dept.name}
          </label>
        ))}
      </div>
    )
  }

  return (
    <select
      className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">All departments (global)</option>
      {departments.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.name}
        </option>
      ))}
    </select>
  )
}

function IntegrationCard({ integration, onDelete }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] text-xl">
            {integration.icon_emoji || '🔗'}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{integration.name}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{integration.description || 'External tool'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={safeHref(integration.launch_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--accent)]"
          >
            Launch ↗
          </a>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--coral)', color: 'var(--coral-dark)' }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EditableIntegrationCard({
  integration,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSave,
  saving,
  departments,
  users,
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Name</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.name}
            onChange={(e) => onChange({ ...integration, name: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Type</span>
          <select
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.type}
            onChange={(e) => onChange({ ...integration, type: e.target.value })}
          >
            {INTEGRATION_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Launch URL</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.launch_url}
            onChange={(e) => onChange({ ...integration, launch_url: e.target.value })}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Description</span>
          <textarea
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            rows={3}
            value={integration.description ?? ''}
            onChange={(e) => onChange({ ...integration, description: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Icon</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.icon_emoji ?? ''}
            onChange={(e) => onChange({ ...integration, icon_emoji: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Visible to</span>
          <select
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.visible_to}
            onChange={(e) => onChange({ ...integration, visible_to: e.target.value })}
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Scope</span>
          <select
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            value={integration.scope ?? 'global'}
            onChange={(e) => onChange({ ...integration, scope: e.target.value })}
          >
            <option value="global">Global (all users)</option>
            <option value="departments">Department(s)</option>
            <option value="users">Individual User(s)</option>
          </select>
        </label>

        {integration.visible_to === 'specific_users' && (
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Specific users with access
            </span>
            <UserSelect
              value={integration.user_ids}
              onChange={(value) => onChange({ ...integration, user_ids: value })}
              users={users}
              multiple={true}
            />
          </label>
        )}

        {integration.scope === 'departments' && (
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Departments</span>
            <DeptSelect
              value={integration.department_ids}
              onChange={(value) => onChange({ ...integration, department_ids: value })}
              departments={departments}
              multiple={true}
            />
          </label>
        )}

        {integration.scope === 'users' && (
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              👤 Individual Users (Admin Only)
            </span>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Assign this integration to specific team members. Leave empty for all users.
            </p>
            <UserSelect
              value={integration.user_ids}
              onChange={(value) => onChange({ ...integration, user_ids: value })}
              users={users}
              multiple={true}
            />
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={Boolean(integration.enabled)}
            onChange={(e) => onChange({ ...integration, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={Boolean(integration.show_in_sidebar)}
            onChange={(e) => onChange({ ...integration, show_in_sidebar: e.target.checked })}
          />
          Show in sidebar
        </label>
        <button type="button" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs" onClick={onMoveUp}>
          Move up
        </button>
        <button type="button" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs" onClick={onMoveDown}>
          Move down
        </button>
        <button
          type="button"
          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--coral)', color: 'var(--coral-dark)' }} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

const EMPTY_INTEGRATION = {
  name: '',
  type: 'custom',
  launch_url: '',
  description: '',
  icon_emoji: '🔗',
  visible_to: 'all',
  scope: 'global', // global, departments, or users
  department_ids: [],
  user_ids: [],
  enabled: true,
  show_in_sidebar: false,
  sort_order: 99,
}

export default function IntegrationsSection({ role, supabaseClient }) {
  const [loading, setLoading] = useState(true)
  const [manageIntegrations, setManageIntegrations] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [integrations, setIntegrations] = useState([])
  const [integrationDrafts, setIntegrationDrafts] = useState([])
  const [newIntegration, setNewIntegration] = useState(EMPTY_INTEGRATION)
  const [integrationSavingId, setIntegrationSavingId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [currentUserDeptId, setCurrentUserDeptId] = useState(null)

  const isSuperAdmin = role === 'super_admin'

  async function loadIntegrations() {
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('external_integrations')
        .select('id, name, type, launch_url, description, icon_emoji, visible_to, enabled, show_in_sidebar, sort_order, department_id, scope, department_ids, user_ids, created_by')
        .order('sort_order')

      if (error) {
        console.error('Failed to load integrations', error)
        console.error('Error details:', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        setIntegrations([])
        setIntegrationDrafts([])
        setLoading(false)
        return
      }

      console.log('Loaded integrations:', data?.length ?? 0, 'items')

      const migratedData = (data ?? []).map(migrateIntegrationRow)

      console.log('Migrated integrations:', migratedData.length, 'items')
      setIntegrations(migratedData)
      setIntegrationDrafts(migratedData)
    } catch (err) {
      console.error('Exception loading integrations:', err)
      setIntegrations([])
      setIntegrationDrafts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIntegrations()
  }, [])

  useEffect(() => {
    Promise.all([
      supabaseClient.from('departments').select('id, name').order('name'),
      supabaseClient.from('users').select('id, name, email, department_id').order('name'),
      supabaseClient.auth.getUser(),
    ]).then(([{ data: deptData }, { data: userData }, { data: authData }]) => {
      setDepartments(deptData ?? [])
      setUsers(userData ?? [])
      const uid = authData?.user?.id ?? null
      setCurrentUserId(uid)
      if (uid && userData) {
        const me = userData.find((u) => u.id === uid)
        setCurrentUserDeptId(me?.department_id ?? null)
      }
    })
  }, [])

  async function saveIntegration(integration) {
    setIntegrationSavingId(integration.id ?? integration.name)

    const payload = buildSavePayload(integration)

    try {
      console.log('Saving integration:', { id: integration.id, payload })

      const query = integration.id
        ? supabaseClient.from('external_integrations').update(payload).eq('id', integration.id)
        : supabaseClient.from('external_integrations').insert({ ...payload, created_by: currentUserId })

      const { data, error } = await query
      setIntegrationSavingId(null)

      if (error) {
        console.error('Save error:', error)
        window.alert(`Failed to save: ${error.message}`)
        return
      }

      console.log('Save successful:', data)
      await loadIntegrations()
      setNewIntegration(EMPTY_INTEGRATION)
    } catch (err) {
      console.error('Exception saving integration:', err)
      setIntegrationSavingId(null)
      window.alert(`Error saving integration: ${err.message}`)
    }
  }

  async function deleteIntegration(id) {
    const { error } = await supabaseClient.from('external_integrations').delete().eq('id', id)
    if (error) {
      window.alert(error.message)
      return
    }

    const next = integrationDrafts.filter((item) => item.id !== id)
    setIntegrations(next)
    setIntegrationDrafts(next)
  }

  function moveDraft(index, direction) {
    const next = [...integrationDrafts]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= next.length) return

    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    setIntegrationDrafts(next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })))
  }

  async function persistDraftOrder() {
    for (const draft of integrationDrafts) {
      if (!draft.id) continue
      await supabaseClient
        .from('external_integrations')
        .update({ sort_order: draft.sort_order })
        .eq('id', draft.id)
    }

    setIntegrations(integrationDrafts)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Integrations</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Launch connected ministry tools from one workspace.
          </p>
        </div>
        {role === 'super_admin' ? (
          <button
            type="button"
            onClick={() => setManageIntegrations((value) => !value)}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
          >
            {manageIntegrations ? 'Done managing' : 'Manage integrations'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          Loading integrations…
        </div>
      ) : null}

      {!loading && isSuperAdmin && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">👤 Admin Control</p>
          <p className="mt-1 text-xs">You can create integrations and assign them to:</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>✓ All users (global)</li>
            <li>✓ Specific departments</li>
            <li>✓ Individual users (assign custom integrations to specific team members)</li>
          </ul>
        </div>
      )}

      {!loading && manageIntegrations && role === 'super_admin' ? (
        <>
          <div className="grid gap-4">
            {integrationDrafts.map((integration, index) => (
              <EditableIntegrationCard
                key={integration.id ?? `${integration.name}-${index}`}
                integration={integration}
                onChange={(next) => {
                  setIntegrationDrafts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? next : item)))
                }}
                onDelete={() => deleteIntegration(integration.id)}
                onMoveUp={() => moveDraft(index, 'up')}
                onMoveDown={() => moveDraft(index, 'down')}
                onSave={async () => {
                  await saveIntegration(integrationDrafts[index])
                  await persistDraftOrder()
                }}
                saving={integrationSavingId === integration.id}
                departments={departments}
                users={users}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-5">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Add integration</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Name" value={newIntegration.name} onChange={(e) => setNewIntegration((prev) => ({ ...prev, name: e.target.value }))} />
              <select className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" value={newIntegration.type} onChange={(e) => setNewIntegration((prev) => ({ ...prev, type: e.target.value }))}>
                {INTEGRATION_TYPES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm md:col-span-2" placeholder="Launch URL" value={newIntegration.launch_url} onChange={(e) => setNewIntegration((prev) => ({ ...prev, launch_url: e.target.value }))} />
              <textarea className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm md:col-span-2" rows={3} placeholder="Description" value={newIntegration.description} onChange={(e) => setNewIntegration((prev) => ({ ...prev, description: e.target.value }))} />
              <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Emoji" value={newIntegration.icon_emoji} onChange={(e) => setNewIntegration((prev) => ({ ...prev, icon_emoji: e.target.value }))} />
              <select className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" value={newIntegration.visible_to} onChange={(e) => setNewIntegration((prev) => ({ ...prev, visible_to: e.target.value }))}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Scope</span>
                <select
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  value={newIntegration.scope ?? 'global'}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, scope: e.target.value }))}
                >
                  <option value="global">Global (all users)</option>
                  <option value="departments">Department(s)</option>
                  <option value="users">Individual User(s)</option>
                </select>
              </label>

              {newIntegration.visible_to === 'specific_users' && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    Specific users with access
                  </label>
                  <UserSelect
                    value={newIntegration.user_ids}
                    onChange={(value) => setNewIntegration((prev) => ({ ...prev, user_ids: value }))}
                    users={users}
                    multiple={true}
                  />
                </div>
              )}

              {newIntegration.scope === 'departments' && (
                <div className="md:col-span-2">
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Departments</label>
                  <DeptSelect
                    value={newIntegration.department_ids}
                    onChange={(value) => setNewIntegration((prev) => ({ ...prev, department_ids: value }))}
                    departments={departments}
                    multiple={true}
                  />
                </div>
              )}

              {newIntegration.scope === 'users' && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    👤 Individual Users (Admin Only)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Assign this integration to specific team members. Leave empty for all users.
                  </p>
                  <UserSelect
                    value={newIntegration.user_ids}
                    onChange={(value) => setNewIntegration((prev) => ({ ...prev, user_ids: value }))}
                    users={users}
                    multiple={true}
                  />
                </div>
              )}
            </div>
            <button type="button" className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" onClick={() => saveIntegration(newIntegration)}>
              Add integration
            </button>
          </div>
        </>
      ) : null}

      {!loading && (!manageIntegrations || role !== 'super_admin') ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onDelete={
                !isSuperAdmin && currentUserId && integration.created_by === currentUserId
                  ? () => deleteIntegration(integration.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}

      {/* Self-service: add private/dept integration for non-super_admin */}
      {!isSuperAdmin && !loading && (
        <div className="mt-2">
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true)
                setNewIntegration({
                  ...EMPTY_INTEGRATION,
                  scope: 'users',
                  user_ids: currentUserId ? [currentUserId] : [],
                })
              }}
              className="rounded-xl border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]"
            >
              + Add my integration
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Add my integration</h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="Name"
                  value={newIntegration.name}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, name: e.target.value }))}
                />
                <select
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  value={newIntegration.type}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, type: e.target.value }))}
                >
                  {INTEGRATION_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm md:col-span-2"
                  placeholder="Launch URL"
                  value={newIntegration.launch_url}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, launch_url: e.target.value }))}
                />
                <textarea
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm md:col-span-2"
                  rows={2}
                  placeholder="Description (optional)"
                  value={newIntegration.description}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, description: e.target.value }))}
                />
                <input
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="Emoji icon (e.g. 🔗)"
                  value={newIntegration.icon_emoji}
                  onChange={(e) => setNewIntegration((prev) => ({ ...prev, icon_emoji: e.target.value }))}
                />
                {role === 'dept_lead' ? (
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Visible to</span>
                    <select
                      className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                      value={newIntegration.scope}
                      onChange={(e) => {
                        const s = e.target.value
                        setNewIntegration((prev) => ({
                          ...prev,
                          scope: s,
                          user_ids: s === 'users' ? (currentUserId ? [currentUserId] : []) : [],
                          department_ids: s === 'departments' ? (currentUserDeptId ? [currentUserDeptId] : []) : [],
                        }))
                      }}
                    >
                      <option value="users">Private (only me)</option>
                      <option value="departments">My department</option>
                    </select>
                  </label>
                ) : (
                  <p className="flex items-center text-xs text-[var(--text-secondary)]">
                    This integration will only be visible to you.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  await saveIntegration(newIntegration)
                  setShowAddForm(false)
                }}
              >
                Add integration
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
