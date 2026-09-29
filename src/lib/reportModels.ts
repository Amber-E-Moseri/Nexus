// Shared report models — renderer-independent data structures
// Used by both PDF export and dashboard/email presentations

export type ReportCenter = {
  church_name: string
  total_attendance: number
  first_timers: number
  status: 'reported' | 'merged' | 'did_not_meet' | 'missing' | 'current'
  wow_delta: number | null
  rolling_avg_4wk: number | null
  merged_with?: string[] | null
  note?: string | null
}

export type TrendPoint = {
  week: string
  attendance: number
  firstTimers: number
}

export type GrowthReport = {
  reportingWeek: string // "September 21, 2026"
  networkAttendance: number
  attendanceDelta: number | null
  firstTimers: number
  reportingCenters: number
  totalCenters: number
  reportingPercentage: number // 0-100
  trend: TrendPoint[]
  centers: ReportCenter[]
  generatedAt: string // ISO timestamp
}

// Calculate report metrics from raw center data
export function buildGrowthReport(
  weekLabel: string,
  centers: ReportCenter[],
  trend: TrendPoint[] = [],
  generatedAt: string = new Date().toISOString()
): GrowthReport {
  const reported = centers.filter(c => c.status === 'reported')

  const networkAttendance = reported.reduce((sum, c) => sum + c.total_attendance, 0)
  const firstTimers = reported.reduce((sum, c) => sum + c.first_timers, 0)
  const attendanceDelta = reported.reduce((sum, c) => sum + (c.wow_delta ?? 0), 0)

  return {
    reportingWeek: weekLabel,
    networkAttendance,
    attendanceDelta: attendanceDelta !== 0 ? attendanceDelta : null,
    firstTimers,
    reportingCenters: reported.length,
    totalCenters: centers.length,
    reportingPercentage: centers.length > 0 ? Math.round((reported.length / centers.length) * 100) : 0,
    trend,
    centers,
    generatedAt,
  }
}

// Format helpers
export const fmt = (n: number | null): string => {
  if (n == null) return '—'
  return n.toLocaleString()
}

export const delta = (n: number | null): string => {
  if (n == null) return '—'
  if (n > 0) return `+${n}`
  return String(n)
}

export const statusLabel: Record<ReportCenter['status'], string> = {
  reported: 'Reported',
  merged: 'Merged',
  did_not_meet: 'Did Not Meet',
  missing: 'Missing',
  current: 'In Progress',
}
