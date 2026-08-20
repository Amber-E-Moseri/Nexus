/**
 * check-reg-access.mjs
 * Usage: node scripts/check-reg-access.mjs <email>
 *
 * Mirrors the checkAccess logic in RegistrationPage.jsx to show exactly
 * what the registration page would grant a user without needing a screenshot.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Read credentials from .env.local (run from repo root)
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const LEGACY_PERMISSIONS = {
  unscoped_edit: ['Programs', 'Secretariat'],
  finance_only:  ['Finance'],
  scoped_edit_all: ['Registration'],
  scoped_edit_reg: ['Accommodation', 'Hospitality'],
  scoped_view_reg: ['Transportation', 'Foundation School Graduation and Baptism', 'Delegates Compliance'],
}

const DEFAULT_TABS = [
  { key: 'overview',      label: 'Overview' },
  { key: 'central',       label: 'Registration Data' },
  { key: 'confirm',       label: 'Delegates',                        hidden: true },
  { key: 'discipleship',  label: 'Foundation & Baptism' },
  { key: 'compliance',    label: 'Hospitality' },
  { key: 'rooms',         label: 'Room Assignments' },
  { key: 'transport',     label: 'Transportation' },
  { key: 'finance',       label: 'Finance',                          restricted: true },
  { key: 'import',        label: 'Import Data' },
  { key: 'settings',      label: 'Settings' },
]

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: node scripts/check-reg-access.mjs <email>'); process.exit(1) }

  // 1. Fetch user
  const { data: user } = await supabase.from('users').select('id,email,role').eq('email', email).maybeSingle()
  if (!user) { console.log(`❌  No user found for ${email}`); process.exit(0) }

  console.log(`\n👤  ${user.email}  (role: ${user.role})\n`)

  const role = user.role
  const userId = user.id

  // 2. Fetch event config
  const { data: config } = await supabase.from('event_configs').select('*').limit(1).maybeSingle()
  const eventConfig = config || {}
  const sprint_pattern = eventConfig.sprint_pattern || '%This Is It 2.0%'
  const permissions = eventConfig.team_permissions || LEGACY_PERMISSIONS

  const UNSCOPED_EDIT_TEAMS  = permissions.unscoped_edit  || []
  const FINANCE_TEAMS        = permissions.finance_only   || []
  const SCOPED_EDIT_ALL_TABS = permissions.scoped_edit_all || []
  const SCOPED_EDIT_REG_ONLY = permissions.scoped_edit_reg || []
  const SCOPED_VIEW_REG_ONLY = permissions.scoped_view_reg || []

  let result = {
    canAccess: false,
    limitedToSubgroups: null,
    sprintEditAccess: false,
    financeAccess: false,
    hasRoomsAccess: false,
    isGloballyScoped: false,
    userTeamNames: [],
    accessPath: '',
  }

  // ── Mirror checkAccess ──────────────────────────────────────────────────────

  if (role === 'regional_secretary') {
    result = { ...result, canAccess: true, sprintEditAccess: true, financeAccess: true, accessPath: 'regional_secretary role' }
  } else if (role === 'super_admin') {
    result = { ...result, canAccess: true, sprintEditAccess: true, accessPath: 'super_admin role' }
  } else {
    // Full grant
    const { data: fullGrant } = await supabase.from('user_grants').select('id').eq('user_id', userId).eq('grant_type', 'registration_full_access').maybeSingle()
    if (fullGrant) {
      result = { ...result, canAccess: true, sprintEditAccess: true, accessPath: 'registration_full_access grant' }
    } else {
      // Sprint team lookup
      const { data: sprint } = await supabase.from('sprints').select('id').ilike('name', sprint_pattern).limit(1).maybeSingle()
      let userTeamNames = []
      let teams = []
      if (sprint?.id) {
        const { data: allTeams } = await supabase.from('sprint_teams').select('id,name,lead_user_id').eq('sprint_id', sprint.id)
        teams = allTeams || []
        if (teams.length) {
          const { data: memberRows } = await supabase.from('sprint_team_members').select('team_id').in('team_id', teams.map(t => t.id)).eq('user_id', userId)
          if (memberRows?.length) {
            userTeamNames = memberRows.map(r => teams.find(t => t.id === r.team_id)?.name || '').filter(Boolean)
          }
        }
      }
      result.userTeamNames = userTeamNames

      const matchesAny = (list) => userTeamNames.some(name => list.some(t => name.toLowerCase().includes(t.toLowerCase())))
      const isLeadOf   = (teamName) => teams.some(t => t.lead_user_id === userId && t.name.toLowerCase().includes(teamName.toLowerCase()))

      if (matchesAny(UNSCOPED_EDIT_TEAMS)) {
        result = { ...result, canAccess: true, sprintEditAccess: true, accessPath: `unscoped team (${userTeamNames.join(', ')})` }
      } else {
        // Pastor subgroup check (after unscoped team check)
        if (role === 'pastor') {
          const { data: assignments } = await supabase.from('pastor_subgroup_assignments').select('subgroup').eq('user_id', userId).eq('status', 'active')
          const subgroups = (assignments || []).map(s => s.subgroup).filter(Boolean)
          if (subgroups.length) {
            result = { ...result, canAccess: 'limited', limitedToSubgroups: subgroups, accessPath: `pastor subgroup assignment (${subgroups.join(', ')})` }
          }
        }

        if (!result.canAccess) {
          if (!sprint?.id || !userTeamNames.length) {
            result.accessPath = sprint?.id ? 'not on any sprint team' : 'no event sprint found'
          } else if (matchesAny(FINANCE_TEAMS)) {
            result = { ...result, canAccess: true, financeAccess: true, accessPath: `finance team (${userTeamNames.join(', ')})` }
          } else if (matchesAny(SCOPED_EDIT_ALL_TABS)) {
            const { data: assignments } = await supabase.from('pastor_subgroup_assignments').select('subgroup').eq('user_id', userId).eq('status', 'active')
            let subgroups = (assignments || []).map(s => s.subgroup).filter(Boolean)
            if (!subgroups.length) {
              const { data: wlEntry } = await supabase.from('working_list').select('subgroup').ilike('email', email).maybeSingle()
              const { data: regEntry } = await supabase.from('registrations').select('subgroup').ilike('email', email).maybeSingle()
              const sg = wlEntry?.subgroup || regEntry?.subgroup
              if (sg) subgroups = [sg]
            }
            if (isLeadOf('Registration')) {
              result = { ...result, canAccess: true, sprintEditAccess: true, accessPath: 'Registration team lead (unscoped)' }
            } else if (subgroups.length) {
              result = { ...result, canAccess: 'limited', limitedToSubgroups: subgroups, sprintEditAccess: true, accessPath: `scoped edit all tabs (${userTeamNames.join(', ')}) → ${subgroups.join(', ')}` }
            } else {
              result.accessPath = 'scoped edit team but no subgroup assigned'
            }
          } else if (matchesAny(SCOPED_EDIT_REG_ONLY)) {
            const { data: wlEntry } = await supabase.from('working_list').select('subgroup').ilike('email', email).maybeSingle()
            const sg = wlEntry?.subgroup
            if (sg) {
              result = { ...result, canAccess: 'limited', limitedToSubgroups: [sg], sprintEditAccess: true, accessPath: `scoped reg-only edit (${userTeamNames.join(', ')}) → ${sg}` }
            } else {
              result.accessPath = 'scoped edit reg team but no subgroup'
            }
          } else if (matchesAny(SCOPED_VIEW_REG_ONLY)) {
            result = { ...result, canAccess: 'limited', accessPath: `scoped view reg-only (${userTeamNames.join(', ')})` }
          } else {
            result.accessPath = userTeamNames.length ? `on sprint team(s) [${userTeamNames.join(', ')}] but no matching permission` : 'no access'
          }
        }
      }
    }
  }

  // ── Finance access (mirrors the useEffect) ──────────────────────────────────
  if (!result.financeAccess) {
    if (role === 'regional_secretary') result.financeAccess = true
    else {
      const { data: fg } = await supabase.from('user_grants').select('id').eq('user_id', userId).eq('grant_type', 'finance_data_access').maybeSingle()
      if (fg) result.financeAccess = true
    }
  }

  // ── Rooms access ────────────────────────────────────────────────────────────
  if (role === 'super_admin' || role === 'regional_secretary') {
    result.hasRoomsAccess = true
  } else {
    const { data: rg } = await supabase.from('user_grants').select('id').eq('user_id', userId).eq('grant_type', 'rooms_access').maybeSingle()
    if (rg) result.hasRoomsAccess = true
    else {
      const { data: sprint } = await supabase.from('sprints').select('id').ilike('name', sprint_pattern).limit(1).maybeSingle()
      if (sprint?.id) {
        const { data: mems } = await supabase.from('sprint_team_members').select('sprint_teams:team_id(name)').eq('user_id', userId)
        if ((mems || []).some(t => (t.sprint_teams?.name || '').toLowerCase().includes('accommodation'))) result.hasRoomsAccess = true
      }
    }
  }

  result.isGloballyScoped = !!(result.limitedToSubgroups?.length)

  // ── Visible tabs ────────────────────────────────────────────────────────────
  const privileged = role === 'super_admin' || role === 'regional_secretary'
  const matchesAnyTeam = (list) => result.userTeamNames.some(name => list.some(t => name.toLowerCase().includes(t.toLowerCase())))

  const visibleTabs = DEFAULT_TABS.filter(t => {
    if (t.hidden) return false
    if (t.key === 'settings') return role === 'super_admin'
    if (t.team_whitelist?.length) return privileged || matchesAnyTeam(t.team_whitelist)
    if (t.restricted && !result.financeAccess && role !== 'regional_secretary') return false
    if (t.key === 'rooms' && !result.hasRoomsAccess) return false
    if (t.key === 'import' && role !== 'super_admin') return false
    if (result.isGloballyScoped && ['import', 'rooms', 'finance'].includes(t.key)) return false
    return true
  })

  // ── Print results ───────────────────────────────────────────────────────────
  const access = result.canAccess === false ? '🚫  NO ACCESS' : result.canAccess === 'limited' ? '🔒  LIMITED' : '✅  FULL ACCESS'
  console.log(`Access:        ${access}`)
  console.log(`Path:          ${result.accessPath}`)
  if (result.limitedToSubgroups) console.log(`Scoped to:     ${result.limitedToSubgroups.join(', ')}`)
  if (result.userTeamNames.length) console.log(`Sprint teams:  ${result.userTeamNames.join(', ')}`)
  console.log(`Can edit:      ${result.sprintEditAccess ? 'yes' : 'no (view only)'}`)
  console.log(`Finance:       ${result.financeAccess ? '✅' : '—'}`)
  console.log(`Rooms:         ${result.hasRoomsAccess ? '✅' : '—'}`)
  console.log(`\nVisible tabs:  ${visibleTabs.map(t => t.label).join('  |  ')}`)
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
