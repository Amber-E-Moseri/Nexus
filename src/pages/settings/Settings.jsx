import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { listDepartments } from '../../lib/people/api'
import { getNotificationPrefs, setNotificationPref } from '../../features/notifications'
import { supabase } from '../../lib/supabase'
import AutomationsPage from '../platform/AutomationsPage'
import IntegrationsSection from './IntegrationsSection'
import NotificationsSection from '../../components/settings/NotificationsSection'
import ProfileSection from './ProfileSection'
import SecuritySection from './SecuritySection'
import EmailSignatureSection from './EmailSignatureSection'
import MembersPanel from '../../components/settings/MembersPanel'
import ApiDocumentationPage from '../ApiDocumentationPage'
import ActivityFeedWidget from '../../features/dashboard/components/ActivityFeedWidget'
import MyTasks from '../personal/MyTasks'
import Planner from '../Planner'

const TABS = ['Profile', 'Notifications', 'Integrations', 'My Tasks', 'Planner', 'Automations', 'Members', 'Activity Log', 'Organisation', 'API', 'Danger Zone']
const EXPORT_TABLE_SELECT = {
  profiles: 'id, full_name, email, department_id, role, status, created_at',
  tasks: 'id, title, description, status, status_id, priority, assignee_id, department_id, sprint_id, due_date, completed_at, created_by, created_at',
  meetings: 'id, title, description, date, location, organizer_id, department_id, created_at, status',
  meeting_attendance_reports: 'id, meeting_id, created_by, label, report_date, subgroup_filter, reach_pct, expected_count, attended_count, absent_count, unexpected_count, present_names, absent_names, unexpected_names, created_at',
  sprints: 'id, name, description, goal, status, start_date, end_date, department_id, created_by, created_at, archived_at, is_archived',
  sprint_members: 'id, sprint_id, user_id, role, joined_at, created_at',
  calendar_events: 'id, title, description, event_type, start_date, end_date, all_day, location, sprint_id, space_id, status, department_id, created_by, created_at',
  communication_campaigns: 'id, name, subject, body, status, segment_id, recipient_filters, scheduled_at, sent_at, recipient_count, sent_count, open_count, failed_count, recurring_rule, created_by, created_at',
  communication_sends: 'id, campaign_id, recipient_email, recipient_name, subject_variant, status, opened_at, error_message, created_at',
  activity_log: 'id, user_id, action, entity_type, entity_id, timestamp',
}

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('Profile')
  const [departments, setDepartments] = useState([])
  const [prefs, setPrefs] = useState({})
  const [name, setName] = useState(profile?.name ?? '')
  const [subgroup, setSubgroup] = useState(profile?.subgroup ?? '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [orgSettings, setOrgSettings] = useState({
    org_name: 'BLW CAN NEXUS',
    timezone: 'America/Toronto',
    logo_url: '',
  })
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgMessage, setOrgMessage] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [deleteAccountInput, setDeleteAccountInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)

  const departmentName = useMemo(
    () => departments.find((department) => department.id === profile?.department_id)?.name ?? 'Unassigned',
    [departments, profile?.department_id],
  )

  const visibleTabs = TABS.filter((tab) => {
    if (tab === 'My Tasks' || tab === 'Planner') return true
    if (tab === 'Automations') return role === 'super_admin' || role === 'dept_lead'
    if (tab === 'Members') return role === 'super_admin' || role === 'dept_lead'
    if (tab === 'Activity Log') return role === 'super_admin' || role === 'dept_lead'
    if (tab === 'Organisation' || tab === 'Danger Zone') return role === 'super_admin'
    return true
  })

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('Profile')
    }
  }, [activeTab, visibleTabs])

  useEffect(() => {
    setName(profile?.name ?? '')
    setSubgroup(profile?.subgroup ?? '')
  }, [profile?.name, profile?.subgroup])

  useEffect(() => {
    let active = true

    async function loadSettingsData() {
      const [nextDepartments, nextPrefs, ownRow, orgData] = await Promise.all([
        listDepartments().catch(() => []),
        user?.id ? getNotificationPrefs(user.id).catch(() => ({})) : Promise.resolve({}),
        profile?.id
          ? supabase.from('users').select('subgroup').eq('id', profile.id).single().then(({ data }) => data).catch(() => null)
          : Promise.resolve(null),
        role === 'super_admin'
          ? supabase.from('org_settings').select('id, org_name, timezone, logo_url').single().then(({ data }) => data).catch(() => null)
          : Promise.resolve(null),
      ])

      if (!active) return

      setDepartments(nextDepartments)
      setPrefs(nextPrefs)

      if (ownRow?.subgroup != null) {
        setSubgroup(ownRow.subgroup)
      }

      if (orgData) {
        setOrgSettings(orgData)
      }
    }

    loadSettingsData()
    return () => {
      active = false
    }
  }, [user?.id, profile?.id, role])

  async function handleSaveProfile() {
    if (!profile?.id) return

    setProfileSaving(true)
    setProfileMessage('')

    const payload = { name: name.trim() }
    if (subgroup !== undefined) payload.subgroup = subgroup.trim() || null

    const { error } = await supabase.from('users').update(payload).eq('id', profile.id)

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
    setShowPasswordForm(false)
  }

  async function handleToggleNotification(type) {
    if (!user?.id) return

    const current = prefs[type] ?? { in_app: true, email: true }
    const nextEnabled = !(current.in_app || current.email)
    const next = { in_app: nextEnabled, email: nextEnabled }

    setPrefs((prev) => ({ ...prev, [type]: next }))

    try {
      await setNotificationPref(user.id, type, next.in_app, next.email)
    } catch (error) {
      setPrefs((prev) => ({ ...prev, [type]: current }))
      window.alert(error.message)
    }
  }

  async function handleSaveOrgSettings() {
    setOrgSaving(true)
    setOrgMessage('')

    try {
      const { error } = await supabase
        .from('org_settings')
        .update({
          org_name: orgSettings.org_name,
          timezone: orgSettings.timezone,
          logo_url: orgSettings.logo_url,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('id', orgSettings.id)

      if (error) throw error

      setOrgMessage('Organisation settings saved.')
    } catch (err) {
      setOrgMessage(err.message)
    } finally {
      setOrgSaving(false)
    }
  }

  async function handleUploadLogo(file) {
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setOrgMessage('Logo upload failed - file too large (max 2MB).')
      return
    }

    setLogoUploading(true)

    try {
      const ext = file.name.split('.').pop()
      const path = `org/logo.${ext}`

      await supabase.storage
        .from('os-attachments')
        .remove(['org/logo.jpg', 'org/logo.png', 'org/logo.gif', 'org/logo.webp'])

      const { error: uploadError } = await supabase.storage
        .from('os-attachments')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('os-attachments').getPublicUrl(path)

      setOrgSettings((prev) => ({ ...prev, logo_url: data.publicUrl }))

      await supabase
        .from('org_settings')
        .update({ logo_url: data.publicUrl })
        .eq('id', orgSettings.id)
    } catch (err) {
      setOrgMessage(`Logo upload failed — ${err.message}`)
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleExportData() {
    if (!window.confirm('This will generate a full data export. Continue?')) return
    setExporting(true)

    try {
      const tables = [
        'profiles',
        'tasks',
        'meetings',
        'meeting_attendance_reports',
        'sprints',
        'sprint_members',
        'calendar_events',
        'communication_campaigns',
        'communication_sends',
        'activity_log',
      ]

      const data = {
        exported_at: new Date().toISOString(),
        tables: {},
      }

      for (const table of tables) {
        const { data: tableData, error } = await supabase.from(table).select(EXPORT_TABLE_SELECT[table]).limit(10000)
        if (error) continue
        data.tables[table] = tableData
      }

      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `blwcannexus-export-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleteAccountInput !== 'DELETE') return

    try {
      // This must eventually be handled by a secure edge function using
      // supabase.auth.admin.deleteUser, not from the client.
      const { error } = await supabase
        .from('deletion_requests')
        .insert({ user_id: user.id, requested_at: new Date().toISOString() })

      if (error) throw error

      setShowDeleteConfirm(false)
      setDeleteAccountInput('')
      window.alert('Account deletion requested — a super admin will process this within 24 hours.')
    } catch (err) {
      window.alert(`Failed to request deletion: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[2rem] font-semibold text-[var(--text-primary)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Profile, notifications, integrations and workspace automations.
        </p>
      </div>

      <div role="tablist" className="flex flex-wrap border-b border-[var(--border)]">
        {visibleTabs.map((tab) => {
          const tabId = tab.toLowerCase().replace(/\s+/g, '-')
          return (
            <button
              key={tab}
              id={`tab-${tabId}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tabId}`}
              onClick={() => setActiveTab(tab)}
              className={[
                'border-b-2 px-3 py-3 text-sm font-medium transition',
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {activeTab === 'Profile' ? (
        <div role="tabpanel" id="tabpanel-profile" aria-labelledby="tab-profile" tabIndex={0} className="space-y-6">
          <ProfileSection
            name={name}
            setName={setName}
            subgroup={subgroup}
            setSubgroup={setSubgroup}
            role={role}
            user={user}
            profile={profile}
            departmentName={departmentName}
            profileMessage={profileMessage}
            profileSaving={profileSaving}
            onSaveProfile={handleSaveProfile}
            onChangePassword={() => setShowPasswordForm((value) => !value)}
            onSignOut={() => supabase.auth.signOut({ scope: 'global' })}
            onRefreshProfile={() => refreshProfile(profile?.id)}
          />

          {showPasswordForm ? (
            <SecuritySection
              passwordForm={passwordForm}
              setPasswordForm={setPasswordForm}
              passwordMessage={passwordMessage}
              passwordSaving={passwordSaving}
              onPasswordUpdate={handlePasswordUpdate}
            />
          ) : null}

          {user?.id ? (
            <EmailSignatureSection userId={user.id} profile={profile} />
          ) : null}
        </div>
      ) : null}

      {activeTab === 'Notifications' ? (
        <div role="tabpanel" id="tabpanel-notifications" aria-labelledby="tab-notifications" tabIndex={0}>
          <NotificationsSection prefs={prefs} role={role} onTogglePref={handleToggleNotification} />
        </div>
      ) : null}

      {activeTab === 'Integrations' ? (
        <div role="tabpanel" id="tabpanel-integrations" aria-labelledby="tab-integrations" tabIndex={0}>
          <IntegrationsSection role={role} supabaseClient={supabase} />
        </div>
      ) : null}

      {activeTab === 'My Tasks' ? (
        <div role="tabpanel" id="tabpanel-my-tasks" aria-labelledby="tab-my-tasks" tabIndex={0}>
          <MyTasks />
        </div>
      ) : null}

      {activeTab === 'Planner' ? (
        <div role="tabpanel" id="tabpanel-planner" aria-labelledby="tab-planner" tabIndex={0}>
          <Planner />
        </div>
      ) : null}

      {activeTab === 'Automations' && (role === 'super_admin' || role === 'dept_lead') ? (
        <div role="tabpanel" id="tabpanel-automations" aria-labelledby="tab-automations" tabIndex={0}>
          <AutomationsPage embedded />
        </div>
      ) : null}

      {activeTab === 'Members' && (role === 'super_admin' || role === 'dept_lead') ? (
        <div role="tabpanel" id="tabpanel-members" aria-labelledby="tab-members" tabIndex={0}>
          <MembersPanel />
        </div>
      ) : null}

      {activeTab === 'Activity Log' && (role === 'super_admin' || role === 'dept_lead') ? (
        <div role="tabpanel" id="tabpanel-activity-log" aria-labelledby="tab-activity-log" tabIndex={0}>
          <ActivityFeedWidget />
        </div>
      ) : null}

      {activeTab === 'Organisation' && role === 'super_admin' ? (
        <div role="tabpanel" id="tabpanel-organisation" aria-labelledby="tab-organisation" tabIndex={0} className="space-y-6">
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Organisation Name</label>
                <input
                  type="text"
                  value={orgSettings.org_name}
                  onChange={(e) => setOrgSettings((prev) => ({ ...prev, org_name: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Timezone</label>
                <select
                  value={orgSettings.timezone}
                  onChange={(e) => setOrgSettings((prev) => ({ ...prev, timezone: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="America/Toronto">America/Toronto</option>
                  <option value="America/Vancouver">America/Vancouver</option>
                  <option value="America/Winnipeg">America/Winnipeg</option>
                  <option value="America/Halifax">America/Halifax</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Logo</label>
                {orgSettings.logo_url ? (
                  <img src={orgSettings.logo_url} alt="Organization logo" loading="lazy" width="160" height="40" style={{ height: 40, marginBottom: 12 }} />
                ) : (
                  <div style={{ color: '#9E9488', fontSize: 13, marginBottom: 12 }}>(no logo)</div>
                )}
                <label className="inline-block rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white cursor-pointer">
                  {logoUploading ? 'Uploading...' : 'Upload logo'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleUploadLogo(e.target.files[0])}
                    disabled={logoUploading}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={handleSaveOrgSettings}
                disabled={orgSaving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {orgSaving ? 'Saving...' : 'Save settings'}
              </button>
            </div>

            {orgMessage && (
              <div style={{ marginTop: 12, fontSize: 13, color: orgMessage.includes('failed') ? '#DC2626' : '#059669' }}>
                {orgMessage}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'API' ? (
        <ApiDocumentationPage />
      ) : null}

      {activeTab === 'Danger Zone' && role === 'super_admin' ? (
        <div role="tabpanel" id="tabpanel-danger-zone" aria-labelledby="tab-danger-zone" tabIndex={0}>
          <div className="rounded-[24px] border-2 border-red-200 bg-red-50 p-5 shadow-[var(--card-shadow)]">
            <h3 style={{ color: '#DC2626', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Danger Zone</h3>
            <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
              These actions are irreversible. Proceed with extreme caution.
            </p>

            <div className="space-y-4">
              <div>
                <button
                  onClick={handleExportData}
                  disabled={exporting}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #DC2626',
                    background: 'transparent',
                    color: '#DC2626',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {exporting ? 'Exporting...' : 'Export all data'}
                </button>
              </div>

              <div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFFFFF',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Delete my account
                </button>
              </div>
            </div>
          </div>

          {showDeleteConfirm && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
              }}
              onClick={() => setShowDeleteConfirm(false)}
            >
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#2D2A22', marginBottom: 12 }}>
                  Delete account?
                </h2>
                <p style={{ fontSize: 13, color: '#6B6360', marginBottom: 16 }}>
                  Type <strong>DELETE</strong> to confirm. This cannot be undone.
                </p>
                <input
                  type="text"
                  placeholder="Type DELETE"
                  value={deleteAccountInput}
                  onChange={(e) => setDeleteAccountInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D9D1C3',
                    borderRadius: 6,
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1px solid #D9D1C3',
                      background: '#FFFFFF',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteAccountInput !== 'DELETE'}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: 'none',
                      background: deleteAccountInput === 'DELETE' ? '#DC2626' : '#D9D1C3',
                      color: '#FFFFFF',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deleteAccountInput === 'DELETE' ? 'pointer' : 'default',
                    }}
                  >
                    Permanently delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
