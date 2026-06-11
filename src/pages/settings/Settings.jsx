import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { listDepartments } from '../../lib/people/api'
import { getNotificationPrefs, NOTIFICATION_TYPES, setNotificationPref } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'
import { getAllSprints } from '../../lib/sprints'
import StatusManagementSection from './StatusManagementSection'
import ZoomSettings from './ZoomSettings'

const TABS = ['Profile', 'Notifications', 'Integrations', 'Status Management', 'Account']

const INTEGRATION_TYPES = ['foundation_school', 'zoom', 'canva', 'google_drive', 'custom']
const VISIBILITY_OPTIONS = ['all', 'super_admin', 'dept_lead']

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function NotificationToggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1 text-xs font-semibold transition',
        active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
      ].join(' ')}
    >
      {children}
    </button>
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
          href={integration.launch_url}
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
        <button type="button" className="rounded-xl border border-red-200 px-3 py-2 text-xs text-red-600" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('Profile')
  const [departments, setDepartments] = useState([])
  const [prefs, setPrefs] = useState({})
  const [integrations, setIntegrations] = useState([])
  const [workspaceStats, setWorkspaceStats] = useState({ members: 0, activeSprints: 0, plan: 'Free' })
  const [name, setName] = useState(profile?.name ?? '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [manageIntegrations, setManageIntegrations] = useState(false)
  const [integrationDrafts, setIntegrationDrafts] = useState([])
  const [newIntegration, setNewIntegration] = useState({
    name: '',
    type: 'custom',
    launch_url: '',
    description: '',
    icon_emoji: '🔗',
    visible_to: 'all',
    enabled: true,
    sort_order: 99,
  })
  const [integrationSavingId, setIntegrationSavingId] = useState(null)

  const departmentName = useMemo(
    () => departments.find((department) => department.id === profile?.department_id)?.name ?? 'Unassigned',
    [departments, profile?.department_id],
  )

  const tabs = role === 'super_admin' ? TABS : TABS.filter((tab) => tab !== 'Account')

  useEffect(() => {
    setName(profile?.name ?? '')
  }, [profile?.name])

  useEffect(() => {
    let active = true

    async function load() {
      const [nextDepartments, nextPrefs, integrationsRes, usersCountRes, sprints] = await Promise.all([
        listDepartments().catch(() => []),
        user?.id ? getNotificationPrefs(user.id).catch(() => ({})) : Promise.resolve({}),
        supabase.from('external_integrations').select('*').order('sort_order').then(({ data }) => data ?? []),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        getAllSprints().catch(() => []),
      ])

      if (!active) return

      setDepartments(nextDepartments)
      setPrefs(nextPrefs)
      setIntegrations(integrationsRes)
      setIntegrationDrafts(integrationsRes)
      setWorkspaceStats({
        members: usersCountRes.count ?? 0,
        activeSprints: sprints.filter((sprint) => sprint.status === 'active').length,
        plan: 'Free',
      })
    }

    load()
    return () => {
      active = false
    }
  }, [user?.id])

  async function handleSaveProfile() {
    if (!profile?.id) return
    setProfileSaving(true)
    setProfileMessage('')

    const { error } = await supabase.from('users').update({ name: name.trim() }).eq('id', profile.id)

    if (error) {
      setProfileMessage(error.message)
      setProfileSaving(false)
      return
    }

    await refreshProfile()
    setProfileMessage('Profile saved.')
    setProfileSaving(false)
  }

  async function handlePasswordUpdate() {
    setPasswordMessage('')
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('New password and confirm password must match.')
      return
    }

    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword })
    setPasswordSaving(false)

    if (error) {
      setPasswordMessage(error.message)
      return
    }

    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordMessage('Password updated.')
  }

  async function handleTogglePref(type, field) {
    if (!user?.id) return

    const current = prefs[type] ?? { in_app: true, email: true }
    const next = { ...current, [field]: !current[field] }

    setPrefs((prev) => ({ ...prev, [type]: next }))

    try {
      await setNotificationPref(user.id, type, next.in_app, next.email)
    } catch (error) {
      setPrefs((prev) => ({ ...prev, [type]: current }))
      window.alert(error.message)
    }
  }

  async function saveIntegration(integration) {
    setIntegrationSavingId(integration.id ?? integration.name)

    const payload = {
      name: integration.name.trim(),
      type: integration.type,
      launch_url: integration.launch_url.trim(),
      description: integration.description?.trim() || null,
      icon_emoji: integration.icon_emoji?.trim() || null,
      visible_to: integration.visible_to,
      enabled: Boolean(integration.enabled),
      sort_order: integration.sort_order ?? 0,
    }

    const query = integration.id
      ? supabase.from('external_integrations').update(payload).eq('id', integration.id)
      : supabase.from('external_integrations').insert(payload)

    const { error } = await query
    setIntegrationSavingId(null)

    if (error) {
      window.alert(error.message)
      return
    }

    const { data } = await supabase.from('external_integrations').select('*').order('sort_order')
    setIntegrations(data ?? [])
    setIntegrationDrafts(data ?? [])
    setNewIntegration({
      name: '',
      type: 'custom',
      launch_url: '',
      description: '',
      icon_emoji: '🔗',
      visible_to: 'all',
      enabled: true,
      sort_order: 99,
    })
  }

  async function deleteIntegration(id) {
    const { error } = await supabase.from('external_integrations').delete().eq('id', id)
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
    const resequenced = next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 }))
    setIntegrationDrafts(resequenced)
  }

  async function persistDraftOrder() {
    for (const draft of integrationDrafts) {
      if (!draft.id) continue
      await supabase.from('external_integrations').update({ sort_order: draft.sort_order }).eq('id', draft.id)
    }
    setIntegrations(integrationDrafts)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Profile, notification preferences, integrations, and account controls
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition',
              activeTab === tab
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-[var(--text-secondary)] shadow-[var(--card-shadow)]',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Profile' ? (
        <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,_var(--accent),_#5a49c8)] text-2xl font-semibold text-white">
                {getInitials(name)}
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{name || 'Your profile'}</h2>
              <p className="mt-1 text-sm capitalize text-[var(--text-secondary)]">{role?.replace('_', ' ')}</p>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Department</div>
                <div className="mt-1 text-[var(--text-primary)]">{departmentName}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Email</div>
                <div className="mt-1 text-[var(--text-primary)]">{user?.email ?? profile?.email}</div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Profile</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Display name</span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Email</span>
                  <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface-secondary)]" value={user?.email ?? profile?.email ?? ''} readOnly />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Role</span>
                  <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface-secondary)] capitalize" value={role?.replace('_', ' ') ?? ''} readOnly />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Department</span>
                  <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface-secondary)]" value={departmentName} readOnly />
                </label>
              </div>

              {profileMessage ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{profileMessage}</p> : null}

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Change password</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Current password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">New password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Confirm password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </label>
              </div>

              {passwordMessage ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{passwordMessage}</p> : null}

              <button
                type="button"
                onClick={handlePasswordUpdate}
                disabled={passwordSaving}
                className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-70"
              >
                {passwordSaving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Notifications' ? (
        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Notification preferences</h3>
          <div className="mt-4 space-y-4">
            {[
              'task_assigned',
              'task_due_soon',
              'sprint_added',
              'sprint_status',
              'meeting_created',
              'comment_added',
              'invitation_accepted',
            ]
              .filter((type) => type !== 'invitation_accepted' || role === 'super_admin' || role === 'dept_lead')
              .map((type) => {
                const current = prefs[type] ?? { in_app: true, email: true }
                return (
                  <div key={type} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {NOTIFICATION_TYPES[type]?.label ?? type}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">Choose how you receive this alert</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <NotificationToggle active={current.in_app} onClick={() => handleTogglePref(type, 'in_app')}>
                        In-app
                      </NotificationToggle>
                      <NotificationToggle active={current.email} onClick={() => handleTogglePref(type, 'email')}>
                        Email
                      </NotificationToggle>
                    </div>
                  </div>
                )
              })}
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Email notifications require verified sender setup.
          </p>
        </section>
      ) : null}

      {activeTab === 'Integrations' ? (
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

          {manageIntegrations && role === 'super_admin' ? (
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
                </div>
                <button type="button" className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" onClick={() => saveIntegration(newIntegration)}>
                  Add integration
                </button>
              </div>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {integrations.map((integration) => (
                <IntegrationCard key={integration.id} integration={integration} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'Status Management' ? (
        <StatusManagementSection role={role} profile={profile} departments={departments} />
      ) : null}

      {activeTab === 'Account' && role === 'super_admin' ? (
        <section className="space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Workspace info</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-[var(--surface-secondary)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Org</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">BLW Canada OS</div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-secondary)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Members</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{workspaceStats.members}</div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-secondary)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Active sprints</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{workspaceStats.activeSprints}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-[var(--text-secondary)]">Plan: {workspaceStats.plan}</div>
          </div>

          <ZoomSettings />

          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-[var(--card-shadow)]">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Danger zone</h3>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.alert('Contact your administrator')}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                Export my data
              </button>
              <button
                type="button"
                onClick={() => supabase.auth.signOut({ scope: 'global' })}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Sign out of all devices
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
