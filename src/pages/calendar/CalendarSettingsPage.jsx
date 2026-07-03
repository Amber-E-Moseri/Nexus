import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import CalendarSettingsPanel from '../../features/calendar/components/CalendarSettingsPanel'
import { SubscriptionManager } from '../../features/calendar/components'
import { GoogleCalendarConnect } from '../../features/calendar/components'
import { CategoryVisibilityConfig } from '../../features/calendar/components'

// Ministry Calendar settings.
// Super admins manage write access, iCal subscriptions, and the Google Calendar
// connection. The Programs team (any Programs space member) and super admins can
// configure event category visibility per role.
export default function CalendarSettingsPage() {
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [programsMembers, setProgramsMembers] = useState([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [programsSpaceId, setProgramsSpaceId] = useState(null)

  useEffect(() => {
    async function loadProgramsMembers() {
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .ilike('name', 'programs')
        .maybeSingle()

      if (!dept) {
        setMembersLoaded(true)
        return
      }
      setProgramsSpaceId(dept.id)

      const { data: members } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('department_id', dept.id)
        .order('name')

      setProgramsMembers(members ?? [])
      setMembersLoaded(true)
    }

    loadProgramsMembers()
  }, [])

  const orgId = profile?.org_id ?? null

  const isSuperAdmin = role === 'super_admin'
  const isProgramsMember = programsMembers.some((m) => m.id === profile?.id)
  // Programs team + super admins manage category visibility.
  const canManageVisibility = isSuperAdmin || isProgramsMember
  // A non-super-admin who isn't on the Programs team has nothing to manage here.
  const hasNoAccess = membersLoaded && !isSuperAdmin && !isProgramsMember

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate('/calendar')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text-primary)', margin: 0 }}>
            Ministry Calendar Settings
          </h1>
          <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Manage write access, subscriptions, and Google Calendar connection.
          </p>
        </div>
      </div>

      {hasNoAccess && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface-tertiary)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
          }}
        >
          You don't have access to these settings. Category visibility is managed by the Programs team
          and super admins.
        </div>
      )}

      {/* Write access, subscriptions, and Google connection are super-admin only. */}
      {isSuperAdmin && (
        <>
          <CalendarSettingsPanel programsMembers={programsMembers} />

          <SubscriptionManager userId={profile?.id} orgId={orgId} />

          {orgId && programsSpaceId && <GoogleCalendarConnect orgId={orgId} spaceId={programsSpaceId} />}
        </>
      )}

      {/* Category visibility — Programs team + super admins. */}
      {canManageVisibility && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Category Visibility
            </h2>
            <p style={{ marginTop: '2px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Configure which roles can see each event category across calendar feeds.
            </p>
          </div>
          <CategoryVisibilityConfig />
        </div>
      )}
    </div>
  )
}
