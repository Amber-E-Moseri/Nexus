import { describe, it, expect } from 'vitest'
import { buildGrowthReport, fmt, delta, statusLabel } from '../lib/reportModels'
import { createFixtureReport, fixtureReportCenters } from './growth-report-fixtures'

describe('Growth Report Models', () => {
  describe('Formatting Functions', () => {
    it('formats numbers with localization', () => {
      expect(fmt(1000)).toBe('1,000')
      expect(fmt(511)).toBe('511')
      expect(fmt(0)).toBe('0')
    })

    it('handles null values', () => {
      expect(fmt(null)).toBe('—')
      expect(fmt(undefined)).toBe('—')
    })

    it('formats delta with sign', () => {
      expect(delta(5)).toBe('+5')
      expect(delta(-3)).toBe('-3')
      expect(delta(0)).toBe('0')
    })

    it('handles null delta', () => {
      expect(delta(null)).toBe('—')
      expect(delta(undefined)).toBe('—')
    })
  })

  describe('Status Labels', () => {
    it('maps all status types', () => {
      expect(statusLabel.reported).toBe('Reported')
      expect(statusLabel.merged).toBe('Merged')
      expect(statusLabel.did_not_meet).toBe('Did Not Meet')
      expect(statusLabel.missing).toBe('Missing')
      expect(statusLabel.current).toBe('In Progress')
    })
  })

  describe('Report Building', () => {
    it('calculates network metrics from reported centers only', () => {
      const report = buildGrowthReport('Test Week', fixtureReportCenters)

      // Only reported centers should be counted
      const reported = fixtureReportCenters.filter(c => c.status === 'reported')
      const expectedAttendance = reported.reduce((sum, c) => sum + c.total_attendance, 0)
      const expectedFirstTimers = reported.reduce((sum, c) => sum + c.first_timers, 0)

      expect(report.networkAttendance).toBe(expectedAttendance)
      expect(report.firstTimers).toBe(expectedFirstTimers)
      expect(report.reportingCenters).toBe(reported.length)
    })

    it('calculates week-over-week delta', () => {
      const report = buildGrowthReport('Test Week', fixtureReportCenters)
      const reported = fixtureReportCenters.filter(c => c.status === 'reported')
      const expectedDelta = reported.reduce((sum, c) => sum + (c.wow_delta ?? 0), 0)

      expect(report.attendanceDelta).toBe(expectedDelta)
    })

    it('calculates reporting percentage', () => {
      const report = buildGrowthReport('Test Week', fixtureReportCenters)
      const expected = Math.round((report.reportingCenters / report.totalCenters) * 100)

      expect(report.reportingPercentage).toBe(expected)
      expect(report.reportingPercentage).toBe(70) // 7 of 10
    })

    it('handles empty centers array', () => {
      const report = buildGrowthReport('Empty Week', [])

      expect(report.networkAttendance).toBe(0)
      expect(report.firstTimers).toBe(0)
      expect(report.reportingCenters).toBe(0)
      expect(report.totalCenters).toBe(0)
      expect(report.reportingPercentage).toBe(0)
    })

    it('includes trend data', () => {
      const trend = [
        { week: '2026-09-21', attendance: 500, firstTimers: 35 },
        { week: '2026-09-28', attendance: 520, firstTimers: 38 },
      ]
      const report = buildGrowthReport('Test Week', fixtureReportCenters, trend)

      expect(report.trend).toEqual(trend)
      expect(report.trend.length).toBe(2)
    })
  })

  describe('Fixture Data Parity', () => {
    it('creates valid fixture report with correct metrics', () => {
      const report = createFixtureReport()

      // Verify structure
      expect(report.reportingWeek).toBe('September 21, 2026')
      expect(report.networkAttendance).toBe(511)
      expect(report.firstTimers).toBe(38)
      expect(report.attendanceDelta).toBe(21)
      expect(report.reportingCenters).toBe(7)
      expect(report.totalCenters).toBe(10)
      expect(report.reportingPercentage).toBe(70)

      // Verify trend data
      expect(report.trend.length).toBe(12)
      expect(report.trend[0].week).toBe('2026-08-31')
      expect(report.trend[11].week).toBe('2026-11-16')

      // Verify centers
      expect(report.centers.length).toBe(10)
      expect(report.centers.filter(c => c.status === 'reported').length).toBe(7)
      expect(report.centers.filter(c => c.status === 'merged').length).toBe(1)
      expect(report.centers.filter(c => c.status === 'did_not_meet').length).toBe(1)
      expect(report.centers.filter(c => c.status === 'missing').length).toBe(1)
    })

    it('handles override values', () => {
      const report = createFixtureReport({
        reportingWeek: 'Custom Week',
        networkAttendance: 999,
      })

      expect(report.reportingWeek).toBe('Custom Week')
      expect(report.networkAttendance).toBe(999)
    })
  })

  describe('Edge Cases', () => {
    it('handles centers with null wow_delta (missing previous week)', () => {
      const centers = [
        {
          church_name: 'Test Church',
          total_attendance: 100,
          first_timers: 5,
          status: 'reported' as const,
          wow_delta: null,
          rolling_avg_4wk: 95,
        },
      ]

      const report = buildGrowthReport('Test Week', centers)

      // When all wow_delta values are null (missing previous week), delta should be null
      // because we cannot report a valid delta without source data
      expect(report.attendanceDelta).toBeNull()
    })

    it('handles merged services with zero attendance', () => {
      const centers = [
        {
          church_name: 'Merged Service',
          total_attendance: 0,
          first_timers: 0,
          status: 'merged' as const,
          wow_delta: null,
          rolling_avg_4wk: null,
          merged_with: ['center-1', 'center-2'],
        },
      ]

      const report = buildGrowthReport('Test Week', centers)

      // Merged should not be counted in reporting
      expect(report.reportingCenters).toBe(0)
      expect(report.networkAttendance).toBe(0)
    })

    it('calculates reporting percentage with single center', () => {
      const centers = [
        {
          church_name: 'Only Center',
          total_attendance: 50,
          first_timers: 3,
          status: 'reported' as const,
          wow_delta: 0,
          rolling_avg_4wk: 50,
        },
      ]

      const report = buildGrowthReport('Test Week', centers)

      expect(report.reportingPercentage).toBe(100)
    })
  })
})
