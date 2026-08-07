import { supabase } from '../../../lib/supabase'

/**
 * Fetch attendance statistics with customizable date range and frequency breakdown.
 * Returns: { in_system_total, in_system_inactive, active, freq_once, freq_twice, freq_thrice, freq_three_plus }
 */
export async function fetchAttendanceStats(params = {}) {
  const {
    dateFrom,
    dateTo,
    eventType = 'all', // 'all', 'service', 'cell'
    subgroupId = null,
    fellowshipId = null,
    cellId = null,
  } = params

  // Build the query
  let query = supabase
    .from('mi_attendance_records')
    .select(
      `
      event_id,
      member_id,
      mi_attendance_events(event_type, event_date)
      `
    )

  // Apply filters
  if (eventType !== 'all') {
    // This requires a join, handled in post-processing
  }
  if (dateFrom || dateTo) {
    // Date filtering also in post-processing
  }

  const { data: records, error } = await query

  if (error) throw error

  // Post-process to apply filters and build frequency breakdown
  const memberAttendance = new Map() // memberId -> count of matching events

  for (const record of records || []) {
    const event = record.mi_attendance_events
    if (!event) continue

    // Apply event type filter
    if (eventType !== 'all' && event.event_type !== eventType) continue

    // Apply date range filter
    if (dateFrom && new Date(event.event_date) < new Date(dateFrom)) continue
    if (dateTo && new Date(event.event_date) > new Date(dateTo)) continue

    const memberId = record.member_id
    memberAttendance.set(memberId, (memberAttendance.get(memberId) || 0) + 1)
  }

  // Get total members count
  let membersQuery = supabase.from('mi_members').select('id', { count: 'exact' })
  if (subgroupId) membersQuery = membersQuery.eq('subgroup_id', subgroupId)
  if (fellowshipId) membersQuery = membersQuery.eq('fellowship_id', fellowshipId)
  if (cellId) membersQuery = membersQuery.eq('cell_id', cellId)

  const { count: totalMembers } = await membersQuery

  // Count frequency buckets
  const stats = {
    in_system_total: totalMembers || 0,
    in_system_inactive: 0,
    active: 0,
    freq_once: 0,
    freq_twice: 0,
    freq_thrice: 0,
    freq_three_plus: 0,
  }

  for (const count of memberAttendance.values()) {
    if (count === 0) stats.in_system_inactive++
    else {
      stats.active++
      if (count === 1) stats.freq_once++
      else if (count === 2) stats.freq_twice++
      else if (count === 3) stats.freq_thrice++
      else if (count >= 3) stats.freq_three_plus++
    }
  }

  // Include members with no attendance
  stats.in_system_inactive = stats.in_system_total - stats.active

  return stats
}

/**
 * Fetch subgroups hierarchy
 */
export async function fetchSubgroups() {
  const { data, error } = await supabase
    .from('mi_subgroups')
    .select('*')
    .order('name')

  if (error) throw error
  return data || []
}

/**
 * Fetch fellowships in a subgroup
 */
export async function fetchFellowships(subgroupId) {
  const { data, error } = await supabase
    .from('mi_fellowships')
    .select('*')
    .eq('subgroup_id', subgroupId)
    .order('name')

  if (error) throw error
  return data || []
}

/**
 * Fetch cells in a fellowship
 */
export async function fetchCells(fellowshipId) {
  const { data, error } = await supabase
    .from('mi_cells')
    .select('*')
    .eq('fellowship_id', fellowshipId)
    .order('name')

  if (error) throw error
  return data || []
}

/**
 * Fetch members in a cell/fellowship/subgroup
 */
export async function fetchMembers(params = {}) {
  const { cellId = null, fellowshipId = null, subgroupId = null, limit = 1000 } = params

  let query = supabase.from('mi_members').select('*')

  if (cellId) query = query.eq('cell_id', cellId)
  if (fellowshipId) query = query.eq('fellowship_id', fellowshipId)
  if (subgroupId) query = query.eq('subgroup_id', subgroupId)

  query = query.order('name').limit(limit)

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Fetch foundation school completion rate
 */
export async function fetchFoundationSchoolStats(params = {}) {
  const { subgroupId = null, fellowshipId = null, cellId = null } = params

  let query = supabase
    .from('mi_members')
    .select('foundation_school_status')
    .eq('is_active', true)

  if (subgroupId) query = query.eq('subgroup_id', subgroupId)
  if (fellowshipId) query = query.eq('fellowship_id', fellowshipId)
  if (cellId) query = query.eq('cell_id', cellId)

  const { data, error } = await query

  if (error) throw error

  const stats = {
    completed: 0,
    in_progress: 0,
    not_recorded: 0,
  }

  for (const member of data || []) {
    const status = member.foundation_school_status || 'not_recorded'
    stats[status] = (stats[status] || 0) + 1
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const percentages = {
    completed: total > 0 ? Math.round((stats.completed / total) * 100) : 0,
    in_progress: total > 0 ? Math.round((stats.in_progress / total) * 100) : 0,
    not_recorded: total > 0 ? Math.round((stats.not_recorded / total) * 100) : 0,
  }

  return { ...stats, percentages, total }
}

/**
 * Fetch first-timers breakdown
 */
export async function fetchFirstTimers(params = {}) {
  const { monthsBack = 1 } = params

  const fromDate = new Date()
  fromDate.setMonth(fromDate.getMonth() - monthsBack)

  const { data, error } = await supabase
    .from('mi_first_timers')
    .select('source')
    .gte('first_service_date', fromDate.toISOString().split('T')[0])

  if (error) throw error

  const stats = {
    service: 0,
    cell: 0,
  }

  for (const record of data || []) {
    const source = record.source || 'service'
    stats[source] = (stats[source] || 0) + 1
  }

  return stats
}

/**
 * Fetch attendance stats aggregated per-subgroup for the hierarchy table.
 * Returns Map<subgroupId, { in_system_total, active, freq_once, freq_twice, freq_thrice, freq_three_plus }>
 */
export async function fetchAllSubgroupStats(params = {}) {
  const { dateFrom, dateTo, eventType = 'all' } = params

  const [{ data: members }, { data: records }] = await Promise.all([
    supabase.from('mi_members').select('id, subgroup_id'),
    supabase
      .from('mi_attendance_records')
      .select('member_id, status, mi_attendance_events(event_type, event_date)')
      .eq('status', 'attended'),
  ])

  const memberSubgroup = new Map()
  const subgroupTotals = new Map()
  for (const m of members || []) {
    memberSubgroup.set(m.id, m.subgroup_id)
    if (m.subgroup_id) subgroupTotals.set(m.subgroup_id, (subgroupTotals.get(m.subgroup_id) || 0) + 1)
  }

  const memberAttendance = new Map()
  for (const record of records || []) {
    const event = record.mi_attendance_events
    if (!event) continue
    if (eventType !== 'all' && event.event_type !== eventType) continue
    if (dateFrom && new Date(event.event_date) < new Date(dateFrom)) continue
    if (dateTo && new Date(event.event_date) > new Date(dateTo)) continue
    memberAttendance.set(record.member_id, (memberAttendance.get(record.member_id) || 0) + 1)
  }

  const result = new Map()
  for (const [sgId, total] of subgroupTotals) {
    result.set(sgId, { in_system_total: total, active: 0, freq_once: 0, freq_twice: 0, freq_thrice: 0, freq_three_plus: 0 })
  }
  for (const [memberId, count] of memberAttendance) {
    const sgId = memberSubgroup.get(memberId)
    if (!sgId || !result.has(sgId)) continue
    const sg = result.get(sgId)
    sg.active++
    if (count === 1) sg.freq_once++
    else if (count === 2) sg.freq_twice++
    else if (count === 3) sg.freq_thrice++
    else sg.freq_three_plus++
  }
  return result
}

/**
 * Fetch attendance stats aggregated per-fellowship for a given subgroup.
 */
export async function fetchAllFellowshipStats(subgroupId, params = {}) {
  const { dateFrom, dateTo, eventType = 'all' } = params

  const [{ data: members }, { data: records }] = await Promise.all([
    supabase.from('mi_members').select('id, fellowship_id').eq('subgroup_id', subgroupId),
    supabase
      .from('mi_attendance_records')
      .select('member_id, mi_attendance_events(event_type, event_date)')
      .eq('status', 'attended'),
  ])

  const memberFellowship = new Map()
  const fellowshipTotals = new Map()
  for (const m of members || []) {
    memberFellowship.set(m.id, m.fellowship_id)
    if (m.fellowship_id) fellowshipTotals.set(m.fellowship_id, (fellowshipTotals.get(m.fellowship_id) || 0) + 1)
  }

  const memberAttendance = new Map()
  for (const record of records || []) {
    const event = record.mi_attendance_events
    if (!event) continue
    if (eventType !== 'all' && event.event_type !== eventType) continue
    if (dateFrom && new Date(event.event_date) < new Date(dateFrom)) continue
    if (dateTo && new Date(event.event_date) > new Date(dateTo)) continue
    if (!memberFellowship.has(record.member_id)) continue
    memberAttendance.set(record.member_id, (memberAttendance.get(record.member_id) || 0) + 1)
  }

  const result = new Map()
  for (const [fId, total] of fellowshipTotals) {
    result.set(fId, { in_system_total: total, active: 0, freq_once: 0, freq_twice: 0, freq_thrice: 0, freq_three_plus: 0 })
  }
  for (const [memberId, count] of memberAttendance) {
    const fId = memberFellowship.get(memberId)
    if (!fId || !result.has(fId)) continue
    const f = result.get(fId)
    f.active++
    if (count === 1) f.freq_once++
    else if (count === 2) f.freq_twice++
    else if (count === 3) f.freq_thrice++
    else f.freq_three_plus++
  }
  return result
}

/**
 * Fetch week-over-week attendance trends.
 * Returns array of { week, week_label, service, cell } sorted ascending.
 */
export async function fetchWeeklyTrends(params = {}) {
  const { dateFrom, dateTo } = params

  const { data: records, error } = await supabase
    .from('mi_attendance_records')
    .select('member_id, mi_attendance_events(event_type, event_date)')
    .eq('status', 'attended')

  if (error) throw error

  const weekMap = new Map()

  for (const record of records || []) {
    const event = record.mi_attendance_events
    if (!event) continue
    const d = new Date(event.event_date)
    if (dateFrom && d < new Date(dateFrom)) continue
    if (dateTo && d > new Date(dateTo)) continue

    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(d)
    weekStart.setDate(diff)
    const weekKey = weekStart.toISOString().split('T')[0]

    if (!weekMap.has(weekKey)) weekMap.set(weekKey, { service: new Set(), cell: new Set() })
    const week = weekMap.get(weekKey)
    if (event.event_type === 'service') week.service.add(record.member_id)
    else if (event.event_type === 'cell') week.cell.add(record.member_id)
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, counts]) => ({
      week,
      week_label: new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      service: counts.service.size,
      cell: counts.cell.size,
    }))
}

/**
 * Fetch sync log (most recent)
 */
export async function fetchSyncLog() {
  const { data, error } = await supabase
    .from('mi_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}
