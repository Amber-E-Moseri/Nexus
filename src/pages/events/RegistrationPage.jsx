import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import PageSpinner from '../../components/ui/PageSpinner'
import RegistrationEcosystem from '../../features/registration/RegistrationEcosystem'

// Full view + edit, no subgroup scope
const UNSCOPED_EDIT_TEAMS = ['Programs', 'Secretariat']

// Full view + finance tab only, no edit, no subgroup scope
const FINANCE_TEAMS = ['Finance']

// Scoped to own subgroup on ALL tabs + edit
const SCOPED_EDIT_ALL_TABS = ['Registration']

// Scoped to own subgroup on Registration Data tab only + edit (see all on their own team tab)
const SCOPED_EDIT_REG_ONLY = ['Accommodation', 'Hospitality']

// Scoped to own subgroup on Registration Data tab only, view only
const SCOPED_VIEW_REG_ONLY = [
  'Transportation',
  'Foundation School Graduation and Baptism',
  'Delegates Compliance',
]

export default function RegistrationPage() {
  const { profile, role } = useAuth()
  const [canAccess, setCanAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [limitedToSubgroups, setLimitedToSubgroups] = useState(null)
  const [sprintEditAccess, setSprintEditAccess] = useState(false)
  const [financeAccess, setFinanceAccess] = useState(false)
  const [limitedToRegistrationDataOnly, setLimitedToRegistrationDataOnly] = useState(false)

  useEffect(() => {
    checkAccess()
  }, [profile?.id, role])

  async function checkAccess() {
    if (!profile?.id) {
      setCanAccess(false); setLoading(false); return
    }

    try {
      // Role-based full access
      if (role === 'super_admin' || role === 'regional_secretary') {
        setSprintEditAccess(true)
        setFinanceAccess(true)
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

      // Pastors are always scoped to their own subgroup regardless of sprint team
      if (role === 'pastor') {
        const subgroups = await getPastorSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setCanAccess('limited')
        } else {
          setCanAccess(false)
        }
        setLoading(false)
        return
      }

      // Look up "This Is It 2.0" sprint
      const { data: sprint } = await supabase
        .from('sprints')
        .select('id')
        .ilike('name', '%This Is It 2.0%')
        .limit(1)
        .maybeSingle()

      if (!sprint?.id) {
        setCanAccess(false); setLoading(false); return
      }

      const { data: teams } = await supabase
        .from('sprint_teams')
        .select('id, name')
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
      const matchesAny = (list) => userTeamNames.some(name =>
        list.some(t => name.toLowerCase().includes(t.toLowerCase()))
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
        const subgroups = await getOwnSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setSprintEditAccess(true)
          setCanAccess('limited')
        } else {
          setSprintEditAccess(true)
          setCanAccess(true)
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
          setSprintEditAccess(true)
          setCanAccess(true)
        }
        setLoading(false)
        return
      }

      // Scoped on Registration Data tab only, view only; see all on their own team tab
      if (matchesAny(SCOPED_VIEW_REG_ONLY)) {
        const subgroups = await getOwnSubgroups()
        if (subgroups.length) {
          setLimitedToSubgroups(subgroups)
          setLimitedToRegistrationDataOnly(true)
          setCanAccess('limited')
        } else {
          setCanAccess(true)
        }
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

  if (!canAccess) {
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
    />
  )
}
