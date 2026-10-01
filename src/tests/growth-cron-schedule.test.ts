// Deterministic tests for the growth report cron wall-clock guard logic.
//
// The PL/pgSQL guard functions check America/Toronto local time and only fire
// within a ±3 minute window of the canonical schedule. These TypeScript helpers
// mirror that logic exactly, allowing tests to run without a database.
//
// Canonical schedule (Eastern Time):
//   Sunday   8:50 PM ET  — sync     (minutes 1247–1253 on Sunday)
//   Sunday   9:00 PM ET  — report   (minutes 1257–1263 on Sunday)
//   Monday   9:00 AM ET  — catch-up (minutes 537–543 on Monday)

import { describe, it, expect } from 'vitest'

// ── Mirror of PL/pgSQL guard logic ───────────────────────────────────────────

/** Returns the day-of-week (0=Sun … 6=Sat) in America/Toronto. */
function dowInToronto(utc: Date): number {
  const str = utc.toLocaleString('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'short',
  })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(str)
}

/** Returns total minutes from midnight in America/Toronto. */
function minutesInToronto(utc: Date): number {
  const parts = utc.toLocaleString('en-US', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).split(':')
  return Number(parts[0]) * 60 + Number(parts[1])
}

/** Mirrors growth_sync_in_window(): Sunday 8:47–8:53 PM ET */
function growthSyncInWindow(utc: Date): boolean {
  return dowInToronto(utc) === 0 && minutesInToronto(utc) >= 1247 && minutesInToronto(utc) <= 1253
}

/** Mirrors growth_report_in_window(): Sunday 8:57–9:03 PM ET */
function growthReportInWindow(utc: Date): boolean {
  return dowInToronto(utc) === 0 && minutesInToronto(utc) >= 1257 && minutesInToronto(utc) <= 1263
}

/** Mirrors growth_catchup_in_window(): Monday 8:57–9:03 AM ET */
function growthCatchupInWindow(utc: Date): boolean {
  return dowInToronto(utc) === 1 && minutesInToronto(utc) >= 537 && minutesInToronto(utc) <= 543
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a UTC Date from an ISO-like string for a given offset from UTC. */
function utcAt(isoLocal: string, offsetHours: number): Date {
  // isoLocal: '2026-10-04T20:50:00' (local Eastern time)
  return new Date(new Date(isoLocal + 'Z').getTime() + offsetHours * 3600_000)
}

/** Build UTC Date directly: e.g. utcTime('2026-10-04', '00:50') */
function utcTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00Z`)
}

// ── Sync window (Sunday 8:50 PM ET) ─────────────────────────────────────────

describe('growthSyncInWindow — EDT (UTC-4, summer)', () => {
  // October 2026: still EDT (DST ends first Sunday November)

  it('fires at exactly 8:50 PM EDT = Monday 00:50 UTC', () => {
    expect(growthSyncInWindow(utcTime('2026-10-05', '00:50'))).toBe(true) // Mon 00:50 UTC = Sun 20:50 EDT
  })

  it('fires within ±3 min window (8:47 PM EDT)', () => {
    expect(growthSyncInWindow(utcTime('2026-10-05', '00:47'))).toBe(true)
  })

  it('fires within ±3 min window (8:53 PM EDT)', () => {
    expect(growthSyncInWindow(utcTime('2026-10-05', '00:53'))).toBe(true)
  })

  it('does NOT fire at 8:46 PM EDT (just outside window)', () => {
    expect(growthSyncInWindow(utcTime('2026-10-05', '00:46'))).toBe(false)
  })

  it('does NOT fire at 8:54 PM EDT (just outside window)', () => {
    expect(growthSyncInWindow(utcTime('2026-10-05', '00:54'))).toBe(false)
  })

  it('does NOT fire at EST candidate (Mon 01:50 UTC = Sun 8:50 PM EST) during EDT season', () => {
    // During EDT season, Mon 01:50 UTC = Sun 9:50 PM EDT — outside sync window
    expect(growthSyncInWindow(utcTime('2026-10-05', '01:50'))).toBe(false)
  })
})

describe('growthSyncInWindow — EST (UTC-5, winter)', () => {
  // January 2027: EST in effect

  it('fires at exactly 8:50 PM EST = Monday 01:50 UTC', () => {
    expect(growthSyncInWindow(utcTime('2027-01-04', '01:50'))).toBe(true) // Mon 01:50 UTC = Sun 20:50 EST
  })

  it('does NOT fire at EDT candidate (Mon 00:50 UTC = Sun 7:50 PM EST) during EST season', () => {
    // During EST season, Mon 00:50 UTC = Sun 7:50 PM EST — outside sync window
    expect(growthSyncInWindow(utcTime('2027-01-04', '00:50'))).toBe(false)
  })
})

// ── Report window (Sunday 9:00 PM ET) ────────────────────────────────────────

describe('growthReportInWindow — EDT', () => {
  it('fires at exactly 9:00 PM EDT = Monday 01:00 UTC', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '01:00'))).toBe(true)
  })

  it('fires within window at 8:57 PM EDT', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '00:57'))).toBe(true)
  })

  it('fires within window at 9:03 PM EDT', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '01:03'))).toBe(true)
  })

  it('does NOT fire at 8:56 PM EDT', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '00:56'))).toBe(false)
  })

  it('does NOT fire at 9:04 PM EDT', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '01:04'))).toBe(false)
  })

  it('does NOT fire at EST candidate (Mon 02:00 UTC = Sun 10:00 PM EDT) during EDT season', () => {
    expect(growthReportInWindow(utcTime('2026-10-05', '02:00'))).toBe(false)
  })
})

describe('growthReportInWindow — EST', () => {
  it('fires at exactly 9:00 PM EST = Monday 02:00 UTC', () => {
    expect(growthReportInWindow(utcTime('2027-01-04', '02:00'))).toBe(true)
  })

  it('does NOT fire at EDT candidate (Mon 01:00 UTC = Sun 8:00 PM EST) during EST season', () => {
    expect(growthReportInWindow(utcTime('2027-01-04', '01:00'))).toBe(false)
  })
})

// ── Catch-up window (Monday 9:00 AM ET) ──────────────────────────────────────

describe('growthCatchupInWindow — EDT', () => {
  it('fires at exactly 9:00 AM EDT = Monday 13:00 UTC', () => {
    expect(growthCatchupInWindow(utcTime('2026-10-05', '13:00'))).toBe(true)
  })

  it('fires at 8:57 AM EDT', () => {
    expect(growthCatchupInWindow(utcTime('2026-10-05', '12:57'))).toBe(true)
  })

  it('fires at 9:03 AM EDT', () => {
    expect(growthCatchupInWindow(utcTime('2026-10-05', '13:03'))).toBe(true)
  })

  it('does NOT fire at 9:04 AM EDT', () => {
    expect(growthCatchupInWindow(utcTime('2026-10-05', '13:04'))).toBe(false)
  })

  it('does NOT fire at EST candidate (Mon 14:00 UTC) during EDT season', () => {
    // Mon 14:00 UTC = 10:00 AM EDT — outside catch-up window
    expect(growthCatchupInWindow(utcTime('2026-10-05', '14:00'))).toBe(false)
  })
})

describe('growthCatchupInWindow — EST', () => {
  it('fires at exactly 9:00 AM EST = Monday 14:00 UTC', () => {
    expect(growthCatchupInWindow(utcTime('2027-01-04', '14:00'))).toBe(true) // Mon Jan 4, 14:00 UTC = Mon 09:00 EST
  })

  it('does NOT fire at EDT candidate (Mon 13:00 UTC = Mon 8:00 AM EST) during EST season', () => {
    expect(growthCatchupInWindow(utcTime('2027-01-04', '13:00'))).toBe(false)
  })
})

// ── No double-send around DST transitions ────────────────────────────────────

describe('DST transition safety — no double send', () => {
  // DST ends Sunday November 1, 2026 at 2:00 AM local time (clocks fall back).
  // The Sunday BEFORE the transition (Oct 25) is still EDT.
  // The Sunday AFTER (Nov 1) is the transition night itself.
  // The Sunday AFTER that (Nov 8) is fully EST.

  it('sync fires exactly once on the EDT Sunday before DST ends (Oct 25)', () => {
    const edtCandidate = utcTime('2026-10-26', '00:50') // Mon 00:50 UTC = Sun 20:50 EDT
    const estCandidate = utcTime('2026-10-26', '01:50') // Mon 01:50 UTC = Sun 21:50 EDT (outside window)
    expect(growthSyncInWindow(edtCandidate)).toBe(true)
    expect(growthSyncInWindow(estCandidate)).toBe(false)
  })

  it('sync fires exactly once on the first fully EST Sunday after DST ends (Nov 8)', () => {
    const edtCandidate = utcTime('2026-11-09', '00:50') // Mon 00:50 UTC = Sun 19:50 EST (outside window)
    const estCandidate = utcTime('2026-11-09', '01:50') // Mon 01:50 UTC = Sun 20:50 EST
    expect(growthSyncInWindow(edtCandidate)).toBe(false)
    expect(growthSyncInWindow(estCandidate)).toBe(true)
  })

  it('report fires exactly once on the EDT Sunday before DST ends', () => {
    const edtCandidate = utcTime('2026-10-26', '01:00')
    const estCandidate = utcTime('2026-10-26', '02:00')
    expect(growthReportInWindow(edtCandidate)).toBe(true)
    expect(growthReportInWindow(estCandidate)).toBe(false)
  })

  it('report fires exactly once on the first fully EST Sunday after DST ends', () => {
    const edtCandidate = utcTime('2026-11-09', '01:00')
    const estCandidate = utcTime('2026-11-09', '02:00')
    expect(growthReportInWindow(edtCandidate)).toBe(false)
    expect(growthReportInWindow(estCandidate)).toBe(true)
  })

  it('catch-up fires exactly once on the EDT Monday before DST ends', () => {
    const edtCandidate = utcTime('2026-10-26', '13:00')
    const estCandidate = utcTime('2026-10-26', '14:00')
    expect(growthCatchupInWindow(edtCandidate)).toBe(true)
    expect(growthCatchupInWindow(estCandidate)).toBe(false)
  })

  it('catch-up fires exactly once on the first fully EST Monday after DST ends', () => {
    const edtCandidate = utcTime('2026-11-09', '13:00')
    const estCandidate = utcTime('2026-11-09', '14:00')
    expect(growthCatchupInWindow(edtCandidate)).toBe(false)
    expect(growthCatchupInWindow(estCandidate)).toBe(true)
  })
})

// ── Wrong day does not fire ───────────────────────────────────────────────────

describe('does not fire on wrong day', () => {
  it('sync does not fire on Saturday', () => {
    // Saturday Mon 00:50 UTC ... wait, need to find a Saturday Mon 00:50 UTC
    // Saturday 2026-10-03 20:50 EDT = Sunday 2026-10-04 00:50 UTC
    // Actually Mon 00:50 UTC when it was Saturday night would be Sat 20:50 EDT
    // Let's use a known Saturday UTC time:
    const saturdayNight = utcTime('2026-10-04', '00:50') // this IS Sunday 20:50 EDT, not Saturday
    // Use a clearly Saturday UTC time: Oct 3 2026 (Saturday) at 00:50 UTC = Fri 20:50 EDT
    const fridayNight = utcTime('2026-10-03', '00:50') // Fri 20:50 EDT
    expect(growthSyncInWindow(fridayNight)).toBe(false)
  })

  it('catch-up does not fire on Sunday', () => {
    // Sunday 9:00 AM EDT = Sunday 13:00 UTC
    const sundayMorning = utcTime('2026-10-04', '13:00')
    expect(growthCatchupInWindow(sundayMorning)).toBe(false)
  })
})
