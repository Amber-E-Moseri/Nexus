// Explicit fixed-clock matrix for the Growth reporting-week definition.
//
// DEFINITION (product decision 2026-10-01): the reporting week is the MONDAY of the latest SUNDAY on or
// before the America/Toronto calendar date of the instant. It rolls over at Sunday 00:00 Toronto time.
//
// Every expectation below is written out by hand — nothing is derived from the code under test.
// `utc` is the exact instant; `local` documents the Toronto wall-clock time it represents.

export interface WeekCase {
  label: string
  utc: string // ISO instant
  local: string // Toronto wall clock (documentation)
  week: string // expected reporting-week Monday
}

export const GROWTH_WEEK_MATRIX: WeekCase[] = [
  // ── EDT (UTC-4): Sunday 2026-10-04 / Monday 2026-10-05 → reporting week Mon 2026-09-28 ──
  { label: 'EDT Sun 8:49 PM',   utc: '2026-10-05T00:49:00Z', local: 'Sun 2026-10-04 20:49 EDT', week: '2026-09-28' },
  { label: 'EDT Sun 8:50 PM',   utc: '2026-10-05T00:50:00Z', local: 'Sun 2026-10-04 20:50 EDT', week: '2026-09-28' },
  { label: 'EDT Sun 9:00 PM',   utc: '2026-10-05T01:00:00Z', local: 'Sun 2026-10-04 21:00 EDT', week: '2026-09-28' },
  { label: 'EDT Sun 9:10 PM',   utc: '2026-10-05T01:10:00Z', local: 'Sun 2026-10-04 21:10 EDT', week: '2026-09-28' },
  { label: 'EDT Sun 11:59 PM',  utc: '2026-10-05T03:59:00Z', local: 'Sun 2026-10-04 23:59 EDT', week: '2026-09-28' },
  { label: 'EDT Mon 12:00 AM',  utc: '2026-10-05T04:00:00Z', local: 'Mon 2026-10-05 00:00 EDT', week: '2026-09-28' },
  { label: 'EDT Mon 9:00 AM',   utc: '2026-10-05T13:00:00Z', local: 'Mon 2026-10-05 09:00 EDT', week: '2026-09-28' },
  // Sunday daytime (week already "the reporting week", still in progress)
  { label: 'EDT Sun 12:00 AM',  utc: '2026-10-04T04:00:00Z', local: 'Sun 2026-10-04 00:00 EDT', week: '2026-09-28' },
  { label: 'EDT Sat 11:59 PM',  utc: '2026-10-04T03:59:00Z', local: 'Sat 2026-10-03 23:59 EDT', week: '2026-09-21' },
  // Mid-week: last completed reporting week (the live-audit "Thursday" case)
  { label: 'EDT Thu 1:49 PM',   utc: '2026-10-01T17:49:00Z', local: 'Thu 2026-10-01 13:49 EDT', week: '2026-09-21' },
  { label: 'EDT Mon 2026-10-05 11:59 PM', utc: '2026-10-06T03:59:00Z', local: 'Mon 2026-10-05 23:59 EDT', week: '2026-09-28' },
  { label: 'EDT Sun next 12:00 AM',       utc: '2026-10-11T04:00:00Z', local: 'Sun 2026-10-11 00:00 EDT', week: '2026-10-05' },

  // ── EST (UTC-5): Sunday 2027-01-10 / Monday 2027-01-11 → reporting week Mon 2027-01-04 ──
  { label: 'EST Sun 8:49 PM',   utc: '2027-01-11T01:49:00Z', local: 'Sun 2027-01-10 20:49 EST', week: '2027-01-04' },
  { label: 'EST Sun 8:50 PM',   utc: '2027-01-11T01:50:00Z', local: 'Sun 2027-01-10 20:50 EST', week: '2027-01-04' },
  { label: 'EST Sun 9:00 PM',   utc: '2027-01-11T02:00:00Z', local: 'Sun 2027-01-10 21:00 EST', week: '2027-01-04' },
  { label: 'EST Sun 9:10 PM',   utc: '2027-01-11T02:10:00Z', local: 'Sun 2027-01-10 21:10 EST', week: '2027-01-04' },
  { label: 'EST Sun 11:59 PM',  utc: '2027-01-11T04:59:00Z', local: 'Sun 2027-01-10 23:59 EST', week: '2027-01-04' },
  { label: 'EST Mon 12:00 AM',  utc: '2027-01-11T05:00:00Z', local: 'Mon 2027-01-11 00:00 EST', week: '2027-01-04' },
  { label: 'EST Mon 9:00 AM',   utc: '2027-01-11T14:00:00Z', local: 'Mon 2027-01-11 09:00 EST', week: '2027-01-04' },
  // In EST the UTC date flips at 7:00 PM ET — before the 8:50 PM sync. The week must NOT change then.
  { label: 'EST Sun 6:59 PM',   utc: '2027-01-10T23:59:00Z', local: 'Sun 2027-01-10 18:59 EST', week: '2027-01-04' },
  { label: 'EST Sun 7:00 PM',   utc: '2027-01-11T00:00:00Z', local: 'Sun 2027-01-10 19:00 EST', week: '2027-01-04' },
  { label: 'EST Sun 12:00 AM',  utc: '2027-01-10T05:00:00Z', local: 'Sun 2027-01-10 00:00 EST', week: '2027-01-04' },
  { label: 'EST Sat 11:59 PM',  utc: '2027-01-10T04:59:00Z', local: 'Sat 2027-01-09 23:59 EST', week: '2026-12-28' },
  // In EDT the UTC date flips at 8:00 PM ET.
  { label: 'EDT Sun 7:59 PM',   utc: '2026-10-04T23:59:00Z', local: 'Sun 2026-10-04 19:59 EDT', week: '2026-09-28' },
  { label: 'EDT Sun 8:00 PM',   utc: '2026-10-05T00:00:00Z', local: 'Sun 2026-10-04 20:00 EDT', week: '2026-09-28' },

  // ── Fall-back: Sun 2026-11-01, 2:00 AM EDT → 1:00 AM EST ──
  { label: 'Fall-back Sat 11:59 PM EDT',    utc: '2026-11-01T03:59:00Z', local: 'Sat 2026-10-31 23:59 EDT', week: '2026-10-19' },
  { label: 'Fall-back Sun 12:00 AM EDT',    utc: '2026-11-01T04:00:00Z', local: 'Sun 2026-11-01 00:00 EDT', week: '2026-10-26' },
  { label: 'Fall-back Sun 1:30 AM (EDT, 1st)', utc: '2026-11-01T05:30:00Z', local: 'Sun 2026-11-01 01:30 EDT', week: '2026-10-26' },
  { label: 'Fall-back Sun 1:30 AM (EST, 2nd)', utc: '2026-11-01T06:30:00Z', local: 'Sun 2026-11-01 01:30 EST', week: '2026-10-26' },
  { label: 'Fall-back Sun 8:50 PM EST',     utc: '2026-11-02T01:50:00Z', local: 'Sun 2026-11-01 20:50 EST', week: '2026-10-26' },
  { label: 'Fall-back Sun 9:00 PM EST',     utc: '2026-11-02T02:00:00Z', local: 'Sun 2026-11-01 21:00 EST', week: '2026-10-26' },
  { label: 'Fall-back Sun 11:59 PM EST',    utc: '2026-11-02T04:59:00Z', local: 'Sun 2026-11-01 23:59 EST', week: '2026-10-26' },
  { label: 'Fall-back Mon 12:00 AM EST',    utc: '2026-11-02T05:00:00Z', local: 'Mon 2026-11-02 00:00 EST', week: '2026-10-26' },
  { label: 'Fall-back Mon 9:00 AM EST',     utc: '2026-11-02T14:00:00Z', local: 'Mon 2026-11-02 09:00 EST', week: '2026-10-26' },

  // ── Spring-forward: Sun 2027-03-14, 2:00 AM EST → 3:00 AM EDT ──
  { label: 'Spring Sat 11:59 PM EST',       utc: '2027-03-14T04:59:00Z', local: 'Sat 2027-03-13 23:59 EST', week: '2027-03-01' },
  { label: 'Spring Sun 12:00 AM EST',       utc: '2027-03-14T05:00:00Z', local: 'Sun 2027-03-14 00:00 EST', week: '2027-03-08' },
  { label: 'Spring Sun 1:59 AM EST',        utc: '2027-03-14T06:59:00Z', local: 'Sun 2027-03-14 01:59 EST', week: '2027-03-08' },
  { label: 'Spring Sun 3:00 AM EDT',        utc: '2027-03-14T07:00:00Z', local: 'Sun 2027-03-14 03:00 EDT', week: '2027-03-08' },
  { label: 'Spring Sun 8:49 PM EDT',        utc: '2027-03-15T00:49:00Z', local: 'Sun 2027-03-14 20:49 EDT', week: '2027-03-08' },
  { label: 'Spring Sun 8:50 PM EDT',        utc: '2027-03-15T00:50:00Z', local: 'Sun 2027-03-14 20:50 EDT', week: '2027-03-08' },
  { label: 'Spring Sun 9:00 PM EDT',        utc: '2027-03-15T01:00:00Z', local: 'Sun 2027-03-14 21:00 EDT', week: '2027-03-08' },
  { label: 'Spring Sun 9:10 PM EDT',        utc: '2027-03-15T01:10:00Z', local: 'Sun 2027-03-14 21:10 EDT', week: '2027-03-08' },
  { label: 'Spring Sun 11:59 PM EDT',       utc: '2027-03-15T03:59:00Z', local: 'Sun 2027-03-14 23:59 EDT', week: '2027-03-08' },
  { label: 'Spring Mon 12:00 AM EDT',       utc: '2027-03-15T04:00:00Z', local: 'Mon 2027-03-15 00:00 EDT', week: '2027-03-08' },
  { label: 'Spring Mon 9:00 AM EDT',        utc: '2027-03-15T13:00:00Z', local: 'Mon 2027-03-15 09:00 EDT', week: '2027-03-08' },
]

// What the OLD (UTC) logic returned at the scheduled points — kept to document the proven defect.
// Old rule: Monday of the UTC date of the instant.
export const OLD_UTC_DEFECT_CASES: { label: string; utc: string; oldWeek: string; correctWeek: string }[] = [
  { label: 'EDT Sun 8:50 PM (sync)',    utc: '2026-10-05T00:50:00Z', oldWeek: '2026-10-05', correctWeek: '2026-09-28' },
  { label: 'EDT Sun 9:00 PM (report)',  utc: '2026-10-05T01:00:00Z', oldWeek: '2026-10-05', correctWeek: '2026-09-28' },
  { label: 'EDT Mon 9:00 AM (catchup)', utc: '2026-10-05T13:00:00Z', oldWeek: '2026-10-05', correctWeek: '2026-09-28' },
  { label: 'EST Sun 8:50 PM (sync)',    utc: '2027-01-11T01:50:00Z', oldWeek: '2027-01-11', correctWeek: '2027-01-04' },
  { label: 'EST Sun 9:00 PM (report)',  utc: '2027-01-11T02:00:00Z', oldWeek: '2027-01-11', correctWeek: '2027-01-04' },
  { label: 'EST Mon 9:00 AM (catchup)', utc: '2027-01-11T14:00:00Z', oldWeek: '2027-01-11', correctWeek: '2027-01-04' },
]
