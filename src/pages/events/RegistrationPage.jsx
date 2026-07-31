import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import PageSpinner from '../../components/ui/PageSpinner'
import RegistrationEcosystem from '../../features/registration/RegistrationEcosystem'

export default function RegistrationPage() {
  const { profile, role } = useAuth()
  const [canAccess, setCanAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [limitedToSubgroups, setLimitedToSubgroups] = useState(null)

  useEffect(() => {
    checkAccess()
  }, [profile?.id, role])

  async function checkAccess() {
    if (!profile?.id) {
      setCanAccess(false)
      setLoading(false)
      return
    }

    try {
      // Super admin always has access
      if (role === 'super_admin') {
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Regional secretary has access
      if (role === 'regional_secretary') {
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Allowed team names (case-insensitive substring matching)
      const allowedTeams = [
        'Foundation School Graduation and Baptism',
        'Secretariat and Planning',
        'Registration',
        'Secretariat Programs',
        'Finance',
        'Transportation',
        'Delegates Compliance',
        'Accommodation and Room Coordination',
        'Hospitality — Delegates',
      ]

      // Check if user is in "This Is It 2.0" sprint
      const { data: sprint, error: sprintError } = await supabase
        .from('sprints')
        .select('id')
        .ilike('name', '%This Is It 2.0%')
        .limit(1)
        .maybeSingle()

      if (sprintError || !sprint?.id) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      // Get all teams in the sprint
      const { data: teams, error: teamsError } = await supabase
        .from('sprint_teams')
        .select('id, name')
        .eq('sprint_id', sprint.id)

      if (teamsError || !teams?.length) {
        setCanAccess(false)
        setLoading(false)
        return
      }

      const teamIds = teams.map(t => t.id)

      // Check if user is in any of the allowed teams
      const { data: userTeams, error: userTeamsError } = await supabase
        .from('sprint_team_members')
        .select('team_id, sprint_teams:team_id(name)')
        .in('team_id', teamIds)
        .eq('user_id', profile.id)

      if (userTeamsError || !userTeams?.length) {
        // Pastor not in any team → limited view (own subgroups only)
        if (role === 'pastor') {
          // Fetch pastor's subgroup assignments
          const { data: subgroupData, error: subgroupError } = await supabase
            .from('pastor_subgroup_assignments')
            .select('subgroup')
            .eq('user_id', profile.id)
            .eq('status', 'active')

          if (!subgroupError && subgroupData?.length > 0) {
            const subgroups = subgroupData.map(s => s.subgroup)
            setLimitedToSubgroups(subgroups)
            setCanAccess('limited')
          } else {
            setCanAccess(false)
          }
        } else {
          setCanAccess(false)
        }
        setLoading(false)
        return
      }

      // Check if user is on Programs or Secretariat team (full access)
      const fullAccessTeams = ['Programs', 'Secretariat']
      const hasFullAccessTeam = userTeams.some(ut => {
        const teamName = ut.sprint_teams?.name || ''
        return fullAccessTeams.some(team =>
          teamName.toLowerCase().includes(team.toLowerCase())
        )
      })

      if (hasFullAccessTeam) {
        setCanAccess(true)
        setLoading(false)
        return
      }

      // Check if any of user's teams match allowed team names
      const userHasAccess = userTeams.some(ut => {
        const teamName = ut.sprint_teams?.name || ''
        return allowedTeams.some(allowed =>
          teamName.toLowerCase().includes(allowed.toLowerCase())
        )
      })

      if (userHasAccess) {
        setCanAccess(true)
      } else if (role === 'pastor') {
        // Pastor in sprint but not in an allowed team → limited view (own subgroups only)
        const { data: subgroupData, error: subgroupError } = await supabase
          .from('pastor_subgroup_assignments')
          .select('subgroup')
          .eq('user_id', profile.id)
          .eq('status', 'active')

        if (!subgroupError && subgroupData?.length > 0) {
          const subgroups = subgroupData.map(s => s.subgroup)
          setLimitedToSubgroups(subgroups)
          setCanAccess('limited')
        } else {
          setCanAccess(false)
        }
      } else {
        setCanAccess(false)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error checking access:', error)
      setCanAccess(false)
      setLoading(false)
    }
  }

  if (loading) {
    return <PageSpinner />
  }

  if (!canAccess) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 12 }}>Access Denied</h1>
        <p style={{ color: '#666' }}>You don't have access to the registration ecosystem.</p>
      </div>
    )
  }

  return <RegistrationEcosystem limitedToSubgroups={canAccess === 'limited' ? limitedToSubgroups : null} />
}
