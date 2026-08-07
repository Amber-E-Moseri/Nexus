import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import PageSpinner from '../../components/ui/PageSpinner'
import RegistrationEcosystem from '../../features/registration/RegistrationEcosystem'
import { useEventConfig } from '../../features/registration/EventConfigContext'

// Preserve the live TII 2.0 behaviour until an administrator deliberately
// activates a configuration for a subsequent event.
const LEGACY_TII_CONFIG = {
  sprint_pattern: '%This Is It 2.0%',
  team_permissions: {
    unscoped_edit: ['Programs', 'Secretariat'],
    finance_only: ['Finance'],
    scoped_edit_all: ['Registration'],
    scoped_edit_reg: ['Accommodation', 'Hospitality'],
    scoped_view_reg: ['Transportation', 'Foundation School Graduation and Baptism', 'Delegates Compliance'],
  },
}

export default function RegistrationPage() {
  const { profile, role } = useAuth()
  const { config, loading: configLoading } = useEventConfig()
  const eventConfig = config || LEGACY_TII_CONFIG
  const [canAccess, setCanAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [limitedToSubgroups, setLimitedToSubgroups] = useState(null)
  const [sprintEditAccess, setSprintEditAccess] = useState(false)
  const [financeAccess, setFinanceAccess] = useState(false)
  const [limitedToRegistrationDataOnly, setLimitedToRegistrationDataOnly] = useState(false)
  const [needsSubgroupAssignment, setNeedsSubgroupAssignment] = useState(false)
  const [userTeamNames, setUserTeamNames] = useState([])

  useEffect(() => {
    if (configLoading) return
    checkAccess()
  }, [profile?.id, role, configLoading, config])

  async function checkAccess() {
    setLoading(true)
    setNeedsSubgroupAssignment(false)
    setLimitedToSubgroups(null)
    setUserTeamNames([])
    if (!profile?.id) {
      setCanAccess(false); setLoading(false); return
    }

    try {
      // Role-based full access — regional_secretary also gets finance; super_admin does not
      if (role === 'regional_secretary') {
        setSprintEditAccess(true)
        setFinanceAccess(true)
        setCanAccess(true)
        setLoading(false)
        return
      }
      if (role === 'super_admin') {
        setSprintEditAccess(true)
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Explicit full-access grant (e.g. Pastor Nigel) — checked before pastor-role scoping
      const { data: fullGrant } = await supabase
        .from('user_grants')
        .select('id')
        .eq('user_id', profile.id)
        .eq('grant_type', 'registration_full_access')
        .maybeSingle()

      if (fullGrant) {
        setSprintEditAccess(true)
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Pastors with an explicit subgroup assignment are scoped to those subgroups.
      // Pastors without one fall through to the sprint team check so that being
      // added to a sprint team (e.g. Foundation School) still grants access.
      if (role === 'pastor') {
        const subgroups = await getPastorSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setCanAccess('limited')
          setLoading(false)
          return
        }
        // No explicit assignment — fall through to sprint team membership check below
      }

      const permissions = eventConfig.team_permissions || {}
      const UNSCOPED_EDIT_TEAMS = permissions.unscoped_edit || []
      const FINANCE_TEAMS = permissions.finance_only || []
      const SCOPED_EDIT_ALL_TABS = permissions.scoped_edit_all || []
      const SCOPED_EDIT_REG_ONLY = permissions.scoped_edit_reg || []
      const SCOPED_VIEW_REG_ONLY = permissions.scoped_view_reg || []

      // Look up the configured event sprint. An empty pattern intentionally grants no access.
      const { data: sprint } = await supabase
        .from('sprints')
        .select('id')
        .ilike('name', eventConfig.sprint_pattern || '')
        .limit(1)
        .maybeSingle()

      if (!sprint?.id) {
        setCanAccess(false); setLoading(false); return
      }

      const { data: teams } = await supabase
        .from('sprint_teams')
        .select('id, name, lead_user_id')
        .eq('sprint_id', sprint.id)

      if (!teams?.length) {
        setCanAccess(false); setLoading(false); return
      }

      const { data: memberRows } = await supabase
        .from('sprint_team_members')
        .select('team_id')
        .in('team_id', teams.map(t => t.id))
        .eq('user_id', profile.id)

      if (!memberRows?.length) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      // Resolve team names from the already-fetched teams list (avoids join issues)
      const userTeamNames = memberRows
        .map(r => teams.find(t => t.id === r.team_id)?.name || '')
        .filter(Boolean)
      setUserTeamNames(userTeamNames)
      const matchesAny = (list) => userTeamNames.some(name =>
        list.some(t => name.toLowerCase().includes(t.toLowerCase()))
      )
      const isLeadOf = (teamName) => teams.some(t =>
        t.lead_user_id === profile.id && t.name.toLowerCase().includes(teamName.toLowerCase())
      )

      // Full view + edit, no scope (Programs, Secretariat)
      if (matchesAny(UNSCOPED_EDIT_TEAMS)) {
        setSprintEditAccess(true)
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Finance tab only, no edit, no scope
      if (matchesAny(FINANCE_TEAMS)) {
        setFinanceAccess(true)
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Scoped on ALL tabs + edit (Registration team)
      if (matchesAny(SCOPED_EDIT_ALL_TABS)) {
        // Team lead of the Registration team gets full unscoped access
        if (isLeadOf('Registration')) {
          setSprintEditAccess(true)
          setCanAccess(true)
          setLoading(false)
          return
        }
        const subgroups = await getOwnSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setSprintEditAccess(true)
          setCanAccess('limited')
        } else {
          setNeedsSubgroupAssignment(true)
          setCanAccess(false)
        }
        setLoading(false)
        return
      }

      // Scoped on Registration Data tab only + edit; see all on their own team tab (Accommodation, Hospitality)
      if (matchesAny(SCOPED_EDIT_REG_ONLY)) {
        const subgroups = await getOwnSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setLimitedToRegistrationDataOnly(true)
          setSprintEditAccess(true)
          setCanAccess('limited')
        } else {
          setNeedsSubgroupAssignment(true)
          setCanAccess(false)
        }
        setLoading(false)
        return
      }

      // Scoped on Registration Data tab only, view only; see all on their own team tab
      if (matchesAny(SCOPED_VIEW_REG_ONLY)) {
        // Transportation and other view-only teams see all registration data (no subgroup scoping)
        setLimitedToRegistrationDataOnly(true)
        setCanAccess('limited')
        setLoading(false)
        return
      }


      setCanAccess(false)
      setLoading(false)
    } catch (error) {
      console.error('Error checking registration access:', error)
      setCanAccess(false)
      setLoading(false)
    }
  }

  async function getPastorSubgroups() {
    const { data } = await supabase
      .from('pastor_subgroup_assignments')
      .select('subgroup')
      .eq('user_id', profile.id)
      .eq('status', 'active')
    return (data || []).map(s => s.subgroup).filter(Boolean)
  }

  async function getOwnSubgroups() {
    // Check explicit subgroup assignments first (works for any user, not just pastors)
    const { data: assigned } = await supabase
      .from('pastor_subgroup_assignments')
      .select('subgroup')
      .eq('user_id', profile.id)
      .eq('status', 'active')

    if (assigned?.length) return assigned.map(s => s.subgroup).filter(Boolean)

    // Fall back: look up their own entry in the working list or registrations
    const email = profile.email?.toLowerCase()
    if (!email) return []

    const [{ data: wlEntry }, { data: regEntry }] = await Promise.all([
      supabase.from('working_list').select('subgroup').ilike('email', email).maybeSingle(),
      supabase.from('registrations').select('subgroup').ilike('email', email).maybeSingle(),
    ])

    const subgroup = wlEntry?.subgroup || regEntry?.subgroup
    return subgroup ? [subgroup] : []
  }

  if (loading) return <PageSpinner />

  if (canAccess === 'no_event') return (
    <div style={{ padding: 40, textAlign: 'center', color: '#8A7F99' }}>
      <p>Registration has not been configured yet.</p>
      <p>Please contact an administrator.</p>
    </div>
  )

  if (!canAccess) {
    if (needsSubgroupAssignment) {
      return (
        <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ marginBottom: 12, fontSize: 20 }}>Subgroup Assignment Needed</h1>
          <p style={{ color: '#444', marginBottom: 16, lineHeight: 1.6 }}>
            You're on an event sprint team, but no subgroup has been assigned to you yet.
            A super admin needs to assign your subgroup before you can access registration data.
          </p>
          <div style={{
            background: '#FFF8E1', border: '1px solid #F59E0B', borderRadius: 8,
            padding: '14px 18px', fontSize: 14, color: '#92400E'
          }}>
            <strong>Action required (super admin):</strong> Add a subgroup assignment for{' '}
            <strong>{profile?.full_name || profile?.email}</strong> in{' '}
            <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 4 }}>pastor_subgroup_assignments</code>{' '}
            or ensure their email is listed in the Working List with a subgroup.
          </div>
        </div>
      )
    }
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 12 }}>Access Denied</h1>
        <p style={{ color: '#666' }}>You don't have access to the registration ecosystem.</p>
      </div>
    )
  }

  return (
    <RegistrationEcosystem
      limitedToSubgroups={canAccess === 'limited' ? limitedToSubgroups : null}
      sprintEditAccess={sprintEditAccess}
      financeAccess={financeAccess}
      limitedToRegistrationDataOnly={limitedToRegistrationDataOnly}
      userTeamNames={userTeamNames}
    />
  )
}
