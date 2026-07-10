import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import CalendarSettingsPanel from '../../features/calendar/components/CalendarSettingsPanel'
import { SubscriptionManager } from '../../features/calendar/components/SubscriptionManager'
import CalendarSourcesAdminPanel from '../../features/calendar/components/CalendarSourcesAdminPanel'
import CategoryVisibilityConfig from '../../features/calendar/components/CategoryVisibilityConfig'

// Ministry Calendar settings.
// Super admins manage write access, iCal subscriptions, and the Google Calendar
// connection. The Programs team (any Programs space member) and super admins can
// configure event category visibility per role.
export default function CalendarSettingsPage() {
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [programsMembers, setProgramsMembers] = useState([])
  const [adminMembers, setAdminMembers] = useState([])
  const [membersLoaded, setMembersLoaded] = useState(false)

  useEffect(() => {
    async function loadCalendarDeptMembers() {
      // Load both Programs and Admin department members to determine calendar access.
      // Note: profile.id is guaranteed to be set by useAuth before this component renders.
      // Both departments are queried by durable boolean flags (is_programs, is_admin),
      // not by display name — this prevents silent breakage if departments are renamed.
      const [programsDept, adminDept] = await Promise.all([
        supabase.from('departments').select('id').eq('is_programs', true).maybeSingle(),
        supabase.from('departments').select('id').eq('is_admin', true).maybeSingle(),
      ])

      const departments = [
        programsDept.data,
        adminDept.data,
      ].filter(Boolean)

      if (departments.length === 0) {
        setMembersLoaded(true)
        return
      }

      const allMembers = await Promise.all(
        departments.map((dept) =>
          supabase
            .from('users')
            .select('id, name, email, department_id')
            .eq('department_id', dept.id)
            .order('name')
        )
      )

      setProgramsMembers(allMembers[0]?.data ?? [])
      setAdminMembers(allMembers[1]?.data ?? [])
      setMembersLoaded(true)
    }

    loadCalendarDeptMembers()
  }, [])

  const orgId = profile?.org_id ?? null

  const isSuperAdmin = role === 'super_admin'
  const isProgramsMember = programsMembers.some((m) => m.id === profile?.id)
  const isAdminMember = adminMembers.some((m) => m.id === profile?.id)

  // dept_lead in Programs or Admin departments can manage their space's calendar.
  // This prevents non-calendar dept_leads (e.g., Media, ORS) from accessing Google connection.
  const isDeptLeadOfCalendarSpace = role === 'dept_lead' && (isProgramsMember || isAdminMember)

  // Programs team + super admins manage category visibility.
  const canManageVisibility = isSuperAdmin || isProgramsMember

  // Super admin or dept_lead of Programs/Admin can manage Google connection and subscriptions.
  const canManageConnections = isSuperAdmin || isDeptLeadOfCalendarSpace

  // A non-manager who isn't on the Programs team has nothing to manage here.
  const hasNoAccess = membersLoaded && !isSuperAdmin && !isDeptLeadOfCalendarSpace && !isProgramsMember

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

      {/* Write access, subscriptions, and Google connection: super_admin, admin_manager, or programs_manager only. */}
      {canManageConnections && (
        <>
          <CalendarSettingsPanel programsMembers={programsMembers} />

          <SubscriptionManager userId={profile?.id} orgId={orgId} />

          <CalendarSourcesAdminPanel />
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
