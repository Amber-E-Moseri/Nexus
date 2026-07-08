import { supabase } from '../../../lib/supabase'

// Normalize names for matching
function normalizeNameKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

// Fetch last N reports for a subgroup/campus (all depts if subgroup is 'all')
export async function fetchRecentReports(departmentId, limit = 5) {
  let query = supabase
    .from('meeting_attendance_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// Build chronic absence data from reports
export async function buildChronicAbsenceData(departmentId, reports, subgroupFilter = null) {
  if (reports.length === 0) return []

  // Fetch roster
  let rosterQuery = supabase
    .from('expected_attendees')
    .select('*')
    .eq('active', true)

  if (subgroupFilter && subgroupFilter !== 'all') {
    rosterQuery = rosterQuery.eq('subgroup', subgroupFilter)
  }

  const { data: roster, error: rosterError } = await rosterQuery
  if (rosterError) throw rosterError

  // Fetch aliases for name matching
  const rosterIds = roster.map(r => r.id).filter(Boolean)
  let aliases = []
  if (rosterIds.length > 0) {
    const { data: aliasData } = await supabase
      .from('expected_attendee_aliases')
      .select('expected_attendee_id, alias_match_key')
      .in('expected_attendee_id', rosterIds)
    aliases = aliasData ?? []
  }

  // Build alias map
  const aliasMap = new Map()
  aliases.forEach(alias => {
    if (alias.alias_match_key) {
      aliasMap.set(alias.alias_match_key, alias.expected_attendee_id)
    }
  })

  // Build roster map: match_key -> roster entry
  const rosterByKey = new Map()
  const rosterById = new Map()
  roster.forEach(r => {
    const key = normalizeNameKey(r.match_key ?? r.full_name)
    rosterByKey.set(key, r)
    rosterById.set(r.id, r)
  })

  // Count absences per person across all reports
  const absenceData = new Map() // match_key -> { person, missedCount, missedReports, lastAttended }

  // Track all people mentioned in reports
  const allPeopleAcross = new Set()

  reports.forEach((report, reportIndex) => {
    const reportDate = report.created_at ? new Date(report.created_at) : null
    const absentNames = report.absent_names ?? []

    absentNames.forEach(absName => {
      const key = normalizeNameKey(absName)
      const rosterEntry = rosterByKey.get(key)

      if (!rosterEntry) return // Not on roster, skip

      allPeopleAcross.add(key)

      if (!absenceData.has(key)) {
        absenceData.set(key, {
          person: rosterEntry,
          missedCount: 0,
          missedReports: [],
          lastAttended: null,
          firstReportDate: reportDate,
        })
      }

      const record = absenceData.get(key)
      record.missedCount += 1
      record.missedReports.push({
        reportId: report.id,
        label: report.label,
        date: reportDate,
      })
    })

    // Also track last attended
    const presentNames = report.present_names ?? []
    presentNames.forEach(presName => {
      const key = normalizeNameKey(presName)
      const rosterEntry = rosterByKey.get(key)

      if (!rosterEntry) return

      allPeopleAcross.add(key)

      if (!absenceData.has(key)) {
        absenceData.set(key, {
          person: rosterEntry,
          missedCount: 0,
          missedReports: [],
          lastAttended: reportDate,
          firstReportDate: reportDate,
        })
      }

      const record = absenceData.get(key)
      if (!record.lastAttended || (reportDate && reportDate > record.lastAttended)) {
        record.lastAttended = reportDate
      }
    })
  })

  // Filter to only people with 3+ absences in last 5 reports
  const chronic = Array.from(absenceData.values())
    .filter(d => d.missedCount >= 3)
    .map(d => ({
      id: d.person.id,
      name: d.person.full_name,
      email: d.person.email,
      subgroup: d.person.subgroup,
      leadership_category: d.person.leadership_category,
      missed: d.missedCount,
      total: reports.length,
      lastAttended: d.lastAttended,
      missedReports: d.missedReports,
    }))
    .sort((a, b) => b.missed - a.missed) // Sort by missed count descending

  return chronic
}

// Get color for missed count
export function getChronicAbsenceColor(missed, total) {
  const pct = (missed / total) * 100
  if (pct >= 80) return '#C94830' // red
  if (pct >= 60) return '#D17A1C' // orange
  return '#E8A020' // yellow
}
