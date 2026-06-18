import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { listDepartments } from '../../lib/people/api'
import { getNotificationPrefs, setNotificationPref } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'
import AutomationsPage from '../platform/AutomationsPage'
import IntegrationsSection from './IntegrationsSection'
import NotificationsSection from './NotificationsSection'
import ProfileSection from './ProfileSection'
import SecuritySection from './SecuritySection'
import EmailSignatureSection from './EmailSignatureSection'
import MembersPanel from '../../components/settings/MembersPanel'

const TABS = ['Profile', 'Notifications', 'Integrations', 'Automations', 'Members']

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

  const departmentName = useMemo(
    () => departments.find((department) => department.id === profile?.department_id)?.name ?? 'Unassigned',
    [departments, profile?.department_id],
  )

  const visibleTabs = TABS.filter((tab) => {
    if (tab === 'Automations') return role === 'super_admin' || role === 'dept_lead'
    if (tab === 'Members') return role === 'super_admin' || role === 'dept_lead' || role === 'owner'
    return true
  })

  useEffect(() => {
    setName(profile?.name ?? '')
    setSubgroup(profile?.subgroup ?? '')
  }, [profile?.name, profile?.subgroup])

  useEffect(() => {
    let active = true

    async function loadSettingsData() {
      const [nextDepartments, nextPrefs, ownRow] = await Promise.all([
        listDepartments().catch(() => []),
        user?.id ? getNotificationPrefs(user.id).catch(() => ({})) : Promise.resolve({}),
        profile?.id
          ? supabase.from('users').select('subgroup').eq('id', profile.id).single().then(({ data }) => data).catch(() => null)
          : Promise.resolve(null),
      ])

      if (!active) return

      setDepartments(nextDepartments)
      setPrefs(nextPrefs)

      if (ownRow?.subgroup != null) {
        setSubgroup(ownRow.subgroup)
      }
    }

    loadSettingsData()
    return () => {
      active = false
    }
  }, [user?.id, profile?.id])

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

      {activeTab === 'Automations' && (role === 'super_admin' || role === 'dept_lead') ? (
        <div role="tabpanel" id="tabpanel-automations" aria-labelledby="tab-automations" tabIndex={0}>
          <AutomationsPage embedded />
        </div>
      ) : null}

      {activeTab === 'Members' && (role === 'super_admin' || role === 'dept_lead' || role === 'owner') ? (
        <div role="tabpanel" id="tabpanel-members" aria-labelledby="tab-members" tabIndex={0}>
          <MembersPanel />
        </div>
      ) : null}
    </div>
  )
}
