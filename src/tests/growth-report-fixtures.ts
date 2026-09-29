// Test fixtures for Growth Report Phase 2
// Representative data including all status types, WoW variations, missing data

import type { GrowthReport, ReportCenter, TrendPoint } from '../lib/reportModels'

export const fixtureReportCenters: ReportCenter[] = [
  {
    church_name: 'BLW Niagara Church',
    total_attendance: 85,
    first_timers: 7,
    status: 'reported',
    wow_delta: 5,
    rolling_avg_4wk: 82.5,
  },
  {
    church_name: 'BLW Edmonton Church',
    total_attendance: 62,
    first_timers: 4,
    status: 'reported',
    wow_delta: -3,
    rolling_avg_4wk: 65.0,
  },
  {
    church_name: 'CESGB City Church',
    total_attendance: 78,
    first_timers: 6,
    status: 'reported',
    wow_delta: 8,
    rolling_avg_4wk: 70.0,
  },
  {
    church_name: 'BLW Calgary Church',
    total_attendance: 54,
    first_timers: 3,
    status: 'reported',
    wow_delta: -2,
    rolling_avg_4wk: 56.0,
  },
  {
    church_name: 'Central East City Church',
    total_attendance: 91,
    first_timers: 9,
    status: 'reported',
    wow_delta: 12,
    rolling_avg_4wk: 79.0,
  },
  {
    church_name: 'BLW Downtown Winnipeg',
    total_attendance: 0,
    first_timers: 0,
    status: 'merged',
    wow_delta: null,
    rolling_avg_4wk: null,
    merged_with: ['auto-12345678'],
    note: 'Services merged with satellite campus',
  },
  {
    church_name: 'Lethbridge City Church',
    total_attendance: 0,
    first_timers: 0,
    status: 'did_not_meet',
    wow_delta: null,
    rolling_avg_4wk: 45.0,
    note: 'Building renovation',
  },
  {
    church_name: 'BLW Regina Church',
    total_attendance: 0,
    first_timers: 0,
    status: 'missing',
    wow_delta: null,
    rolling_avg_4wk: 52.0,
  },
  {
    church_name: 'BLW Mississauga Church',
    total_attendance: 73,
    first_timers: 5,
    status: 'reported',
    wow_delta: 1,
    rolling_avg_4wk: 71.5,
  },
  {
    church_name: 'BLW Scarborough Church',
    total_attendance: 68,
    first_timers: 4,
    status: 'reported',
    wow_delta: null, // Previous week missing
    rolling_avg_4wk: 65.0,
  },
]

export const fixtureTrend: TrendPoint[] = [
  { week: '2026-08-31', attendance: 640, firstTimers: 42 },
  { week: '2026-09-07', attendance: 655, firstTimers: 45 },
  { week: '2026-09-14', attendance: 668, firstTimers: 48 },
  { week: '2026-09-21', attendance: 675, firstTimers: 51 },
  { week: '2026-09-28', attendance: 682, firstTimers: 53 },
  { week: '2026-10-05', attendance: 695, firstTimers: 56 },
  { week: '2026-10-12', attendance: 708, firstTimers: 58 },
  { week: '2026-10-19', attendance: 720, firstTimers: 62 },
  { week: '2026-10-26', attendance: 738, firstTimers: 65 },
  { week: '2026-11-02', attendance: 745, firstTimers: 67 },
  { week: '2026-11-09', attendance: 760, firstTimers: 70 },
  { week: '2026-11-16', attendance: 775, firstTimers: 73 },
]

export function createFixtureReport(overrides?: Partial<GrowthReport>): GrowthReport {
  const reported = fixtureReportCenters.filter(c => c.status === 'reported')
  const networkAttendance = reported.reduce((sum, c) => sum + c.total_attendance, 0)
  const firstTimers = reported.reduce((sum, c) => sum + c.first_timers, 0)
  const attendanceDelta = reported.reduce((sum, c) => sum + (c.wow_delta ?? 0), 0)

  return {
    reportingWeek: 'September 21, 2026',
    networkAttendance,
    attendanceDelta,
    firstTimers,
    reportingCenters: reported.length,
    totalCenters: fixtureReportCenters.length,
    reportingPercentage: Math.round((reported.length / fixtureReportCenters.length) * 100),
    trend: fixtureTrend,
    centers: fixtureReportCenters,
    generatedAt: new Date().toISOString(),
    ...overrides,
  }
}
