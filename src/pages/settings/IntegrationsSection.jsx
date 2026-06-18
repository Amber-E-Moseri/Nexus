import { useEffect, useState } from 'react'
import { safeHref } from '../../lib/urlUtils'

const INTEGRATION_TYPES = ['foundation_school', 'zoom', 'canva', 'google_drive', 'custom']
const VISIBILITY_OPTIONS = ['all', 'super_admin', 'dept_lead']

function DeptSelect({ value, onChange, departments }) {
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

function IntegrationCard({ integration }) {
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
        <a
          href={safeHref(integration.launch_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--accent)]"
        >
          Launch ↗
        </a>
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
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Department</span>
          <DeptSelect
            value={integration.department_id}
            onChange={(value) => onChange({ ...integration, department_id: value })}
            departments={departments}
          />
        </label>
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
  department_id: null,
  enabled: true,
  show_in_sidebar: false,
  sort_order: 99,
}

export default function IntegrationsSection({ role, supabaseClient }) {
  const [loading, setLoading] = useState(true)
  const [manageIntegrations, setManageIntegrations] = useState(false)
  const [integrations, setIntegrations] = useState([])
  const [integrationDrafts, setIntegrationDrafts] = useState([])
  const [newIntegration, setNewIntegration] = useState(EMPTY_INTEGRATION)
  const [integrationSavingId, setIntegrationSavingId] = useState(null)
  const [departments, setDepartments] = useState([])

  async function loadIntegrations() {
    setLoading(true)
    const { data, error } = await supabaseClient
      .from('external_integrations')
      .select('id, name, type, launch_url, description, icon_emoji, visible_to, department_id, enabled, show_in_sidebar, sort_order')
      .order('sort_order')

    if (error) {
      console.error('Failed to load integrations', error)
      setIntegrations([])
      setIntegrationDrafts([])
      setLoading(false)
      return
    }

    setIntegrations(data ?? [])
    setIntegrationDrafts(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadIntegrations()
  }, [])

  useEffect(() => {
    supabaseClient
      .from('departments')
      .select('id, name')
      .order('name')
      .then(({ data }) => setDepartments(data ?? []))
  }, [])

  async function saveIntegration(integration) {
    setIntegrationSavingId(integration.id ?? integration.name)

    const payload = {
      name: integration.name.trim(),
      type: integration.type,
      launch_url: integration.launch_url.trim(),
      description: integration.description?.trim() || null,
      icon_emoji: integration.icon_emoji?.trim() || null,
      visible_to: integration.visible_to,
      department_id: integration.department_id ?? null,
      enabled: Boolean(integration.enabled),
      show_in_sidebar: Boolean(integration.show_in_sidebar),
      sort_order: integration.sort_order ?? 0,
    }

    const query = integration.id
      ? supabaseClient.from('external_integrations').update(payload).eq('id', integration.id)
      : supabaseClient.from('external_integrations').insert(payload)

    const { error } = await query
    setIntegrationSavingId(null)

    if (error) {
      window.alert(error.message)
      return
    }

    await loadIntegrations()
    setNewIntegration(EMPTY_INTEGRATION)
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
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Department</label>
                <DeptSelect
                  value={newIntegration.department_id}
                  onChange={(value) => setNewIntegration((prev) => ({ ...prev, department_id: value }))}
                  departments={departments}
                />
              </div>
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
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
