import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import PageSpinner from '../../components/ui/PageSpinner'
import RegistrationEcosystem from '../../features/registration/RegistrationEcosystem'
import { EventConfigContext } from '../../features/registration/EventConfigContext'
import ICPLCPortal from '../../features/icplc/ICPLCPortal.jsx'

// Tabs shown for ICPLC — everything else is hidden via tab_config overrides.
// central = Registration Data (includes per-person flight info)
// rooms   = Room Assignments
// transport = Transportation / flights manifest
// finance tab is intentionally NOT hidden — Finance team members on the ICPLC
// sprint get access via the finance_only team permission tier.
const ICPLC_HIDDEN_TABS = ['overview', 'summary', 'tii-report', 'checkin', 'confirm', 'discipleship', 'compliance', 'import']

const ICPLC_DEFAULT_CONFIG = {
  event_name: 'ICPLC',
  sprint_pattern: '%ICPLC%',
  public_token_key: 'icplc_public_token',
  early_cutoff_at: null,
  early_fee: 0,
  standard_fee: 0,
  local_detection_regex: 'manitoba|winnipeg',
  exempt_fellowships: [],
  tab_config: ICPLC_HIDDEN_TABS.map((key) => ({ key, hidden: true })),
  team_permissions: {
    unscoped_edit: ['Programs', 'Secretariat', 'Planning'],
    finance_only: ['Finance'],
    scoped_edit_all: ['Registration'],
    scoped_edit_reg: ['Accommodation', 'Hospitality'],
    scoped_view_reg: ['Transportation'],
  },
}

// Stable context value shape so RegistrationEcosystem's useEventConfig() sees ICPLC.
function ICPLCConfigProvider({ config, children }) {
  const value = React.useMemo(
    () => ({ config, loading: false, error: null, reload: () => {} }),
    [config],
  )
  return (
    <EventConfigContext.Provider value={value}>
      {children}
    </EventConfigContext.Provider>
  )
}

export default function ICPLCPage() {
  const { profile, role } = useAuth()
  const [eventConfig, setEventConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [canAccess, setCanAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sprintEditAccess, setSprintEditAccess] = useState(false)
  const [financeAccess, setFinanceAccess] = useState(false)
  const [userTeamNames, setUserTeamNames] = useState([])
  const [needsSubgroupAssignment, setNeedsSubgroupAssignment] = useState(false)

  // Load ICPLC event_config row (not the active singleton — look up by name).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('event_configs')
        .select('*')
        .ilike('event_name', '%ICPLC%')
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        // Merge DB config on top of defaults so any field not yet in the DB row
        // still has a sensible fallback (public_token_key, tab_config, etc.).
        const merged = data
          ? { ...ICPLC_DEFAULT_CONFIG, ...data, tab_config: data.tab_config?.length ? data.tab_config : ICPLC_DEFAULT_CONFIG.tab_config }
          : ICPLC_DEFAULT_CONFIG
        setEventConfig(merged)
        setConfigLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (configLoading || !eventConfig) return
    checkAccess()
  }, [profile?.id, role, configLoading, eventConfig])

  async function checkAccess() {
    setLoading(true)
    setNeedsSubgroupAssignment(false)
    setUserTeamNames([])
    if (!profile?.id) { setCanAccess(false); setLoading(false); return }

    try {
      if (role === 'regional_secretary') {
        setSprintEditAccess(true); setFinanceAccess(true); setCanAccess(true); setLoading(false); return
      }
      if (role === 'super_admin') {
        setSprintEditAccess(true); setCanAccess(true); setLoading(false); return
      }

      // Explicit full-access grant
      const { data: fullGrant } = await supabase
        .from('user_grants')
        .select('id')
        .eq('user_id', profile.id)
        .eq('grant_type', 'registration_full_access')
        .maybeSingle()
      if (fullGrant) { setSprintEditAccess(true); setCanAccess(true); setLoading(false); return }

      // Sprint team membership check
      const { data: sprint } = await supabase
        .from('sprints')
        .select('id')
        .ilike('name', eventConfig.sprint_pattern || '')
        .limit(1)
        .maybeSingle()

      if (!sprint?.id) { setCanAccess(false); setLoading(false); return }

      const { data: teams } = await supabase
        .from('sprint_teams')
        .select('id, name, lead_user_id')
        .eq('sprint_id', sprint.id)

      let resolvedTeamNames = []
      if (teams?.length) {
        const { data: memberRows } = await supabase
          .from('sprint_team_members')
          .select('team_id')
          .in('team_id', teams.map((t) => t.id))
          .eq('user_id', profile.id)

        if (memberRows?.length) {
          resolvedTeamNames = memberRows
            .map((r) => teams.find((t) => t.id === r.team_id)?.name || '')
            .filter(Boolean)
          setUserTeamNames(resolvedTeamNames)
        }
      }

      if (!resolvedTeamNames.length) { setCanAccess(false); setLoading(false); return }

      const permissions = eventConfig.team_permissions || {}
      const matchesAny = (list) => resolvedTeamNames.some((name) =>
        (list || []).some((t) => name.toLowerCase().includes(t.toLowerCase()))
      )
      const isLeadOf = (teamName) => (teams || []).some((t) =>
        t.lead_user_id === profile.id && t.name.toLowerCase().includes(teamName.toLowerCase())
      )

      if (matchesAny(permissions.unscoped_edit)) {
        setSprintEditAccess(true); setCanAccess(true); setLoading(false); return
      }
      if (matchesAny(permissions.finance_only)) {
        setFinanceAccess(true); setCanAccess(true); setLoading(false); return
      }
      if (matchesAny(permissions.scoped_edit_all)) {
        if (isLeadOf('Registration')) { setSprintEditAccess(true); setCanAccess(true) }
        else { setSprintEditAccess(true); setCanAccess('limited') }
        setLoading(false); return
      }
      if (matchesAny(permissions.scoped_edit_reg)) {
        setSprintEditAccess(true); setCanAccess('limited'); setLoading(false); return
      }
      if (matchesAny(permissions.scoped_view_reg)) {
        setCanAccess('limited'); setLoading(false); return
      }

      setCanAccess(true); setLoading(false)
    } catch (err) {
      console.error('ICPLC access check failed:', err)
      setCanAccess(false); setLoading(false)
    }
  }

  if (loading || configLoading) return <PageSpinner />

  if (!canAccess) {
    if (needsSubgroupAssignment) {
      return (
        <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ marginBottom: 12, fontSize: 20 }}>Subgroup Assignment Needed</h1>
          <p style={{ color: '#444', lineHeight: 1.6 }}>
            You're on the ICPLC sprint team, but no subgroup has been assigned to you yet.
            A super admin needs to set up your assignment before you can access registration data.
          </p>
        </div>
      )
    }
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 12 }}>Access Denied</h1>
        <p style={{ color: '#666' }}>You don't have access to ICPLC registration.</p>
      </div>
    )
  }

  // Derive a clean access tier for ICPLCPortal from existing checkAccess() state.
  // ICPLCPage NEVER provisions database grants — RLS derives capability from
  // team membership server-side. This is a UI-only tier for conditional rendering.
  function deriveAccessTier() {
    if (financeAccess && !sprintEditAccess) return 'finance_only'
    if (role === 'super_admin' || role === 'regional_secretary') return 'admin'
    if (sprintEditAccess && canAccess === true) return 'write'
    return 'read_only'
  }

  const accessTier = deriveAccessTier()

  // Legacy tab content — RegistrationEcosystem receives the same props as before.
  // ICPLCPortal renders it in legacy tabs via the legacyContent prop, never importing
  // RegistrationEcosystem itself.
  const legacyContent = (
    <RegistrationEcosystem
      limitedToSubgroups={canAccess === 'limited' ? [] : null}
      sprintEditAccess={sprintEditAccess}
      financeAccess={financeAccess}
      limitedToRegistrationDataOnly={false}
      userTeamNames={userTeamNames}
    />
  )

  return (
    <ICPLCConfigProvider config={eventConfig}>
      <ICPLCPortal
        config={eventConfig}
        accessTier={accessTier}
        financeAccess={financeAccess}
        legacyContent={legacyContent}
      />
    </ICPLCConfigProvider>
  )
}
