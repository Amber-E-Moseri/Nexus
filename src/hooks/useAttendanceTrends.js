import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const MEETING_TYPES = [
  { value: 'north_american', label: 'North American' },
  { value: 'regional', label: 'Regional' },
  { value: 'staff', label: 'Staff' },
  { value: 'sub_group', label: 'Sub Group' },
  { value: 'group', label: 'Group' },
  { value: 'special', label: 'Special' },
]

const ROLES = [
  { value: 'cell_leader', label: 'Cell Leader' },
  { value: 'bsc_teacher', label: 'BSC Teacher' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'leader_in_training', label: 'Leader in Training' },
  { value: 'leader', label: 'Leader' },
]

const PERIODS = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
]

export { MEETING_TYPES, ROLES, PERIODS }

export function useAttendanceTrends({ meetingType, subgroupId, period, role }) {
  const [subgroups, setSubgroups] = useState([])
  const [ranking, setRanking] = useState([])
  const [absences, setAbsences] = useState([])
  const [monthlyTrend, setMonthlyTrend] = useState([])
  const [roleBreakdown, setRoleBreakdown] = useState([])
  const [lit, setLit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        subgroupsRes,
        rankingRes,
        absencesRes,
        litRes,
      ] = await Promise.all([
        supabase.from('attendance_subgroups').select('id, name, group_id').order('name'),
        supabase.rpc('get_subgroup_ranking', { p_meeting_type: meetingType, p_period: period }),
        supabase.rpc('get_consecutive_absences', { p_subgroup_id: subgroupId || null }),
        supabase.rpc('get_lit_dropout_rate', { p_period: period === 'all' ? 'quarter' : period }),
      ])

      if (subgroupsRes.error) throw subgroupsRes.error
      if (rankingRes.error) throw rankingRes.error
      if (absencesRes.error) throw absencesRes.error
      if (litRes.error) throw litRes.error

      setSubgroups(subgroupsRes.data ?? [])
      setRanking(rankingRes.data ?? [])
      setAbsences(absencesRes.data ?? [])

      const litRows = litRes.data ?? []
      setLit(litRows.length > 0
        ? {
            totalLit: litRows[0].total_lit,
            activeLit: litRows[0].active_lit,
            droppedLit: litRows[0].dropped_lit,
            dropoutPct: litRows[0].dropout_pct,
            members: litRows.map((r) => ({ id: r.member_id, name: r.member_name, firstAttended: r.first_attended, lastAttended: r.last_attended })),
          }
        : { totalLit: 0, activeLit: 0, droppedLit: 0, dropoutPct: 0, members: [] })

      // Monthly trend needs a subgroup — use selected one, or the top-ranked one as a default
      const trendSubgroupId = subgroupId || rankingRes.data?.[0]?.subgroup_id || null
      if (trendSubgroupId) {
        const { data: trendData, error: trendErr } = await supabase.rpc('get_monthly_trend', {
          p_subgroup_id: trendSubgroupId,
          p_year: year,
        })
        if (trendErr) throw trendErr
        setMonthlyTrend(trendData ?? [])
      } else {
        setMonthlyTrend([])
      }

      // Role breakdown needs a specific meeting — use the most recent meeting of the filtered type
      const { data: recentMeeting } = await supabase
        .from('attendance_meetings')
        .select('id')
        .eq('type', meetingType)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentMeeting?.id) {
        const { data: roleData, error: roleErr } = await supabase.rpc('get_role_attendance_breakdown', {
          p_meeting_id: recentMeeting.id,
        })
        if (roleErr) throw roleErr
        setRoleBreakdown(roleData ?? [])
      } else {
        setRoleBreakdown([])
      }
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [meetingType, subgroupId, period, year])

  useEffect(() => { load() }, [load])

  return {
    subgroups,
    ranking,
    absences: role ? absences.filter((a) => a.role === role) : absences,
    monthlyTrend,
    roleBreakdown,
    lit,
    loading,
    error,
    reload: load,
  }
}
