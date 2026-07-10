import { describe, expect, test } from 'vitest'
import {
  applyOffsetToChild,
  blockDurationMinutes,
  computeLanes,
  computeOffsetMinutes,
  formatTimeRange,
  minutesToTime,
  parseTimeToMinutes,
  snapMinutes,
} from '../src/features/planner/lib/timeBlockUtils'

describe('time conversions', () => {
  test('parseTimeToMinutes / minutesToTime round-trip', () => {
    expect(parseTimeToMinutes('14:30:00')).toBe(870)
    expect(minutesToTime(870)).toBe('14:30:00')
    expect(minutesToTime(0)).toBe('00:00:00')
  })

  test('blockDurationMinutes', () => {
    expect(blockDurationMinutes({ scheduled_start_time: '14:00:00', scheduled_end_time: '15:30:00' })).toBe(90)
  })

  test('formatTimeRange shows meridiem once when shared', () => {
    expect(formatTimeRange('14:00:00', '15:00:00')).toBe('2:00 – 3:00 PM')
    expect(formatTimeRange('11:00:00', '13:00:00')).toBe('11:00 AM – 1:00 PM')
  })

  test('snapMinutes snaps to 15-minute steps', () => {
    expect(snapMinutes(22)).toBe(15)
    expect(snapMinutes(23)).toBe(30)
  })
})

describe('parent/child offset preservation (spec 1.4 example)', () => {
  const parent = { scheduled_date: '2026-07-08', scheduled_start_time: '14:00:00', scheduled_end_time: '16:00:00' }
  const subA = { scheduled_date: '2026-07-08', scheduled_start_time: '14:15:00', scheduled_end_time: '14:45:00' }
  const subB = { scheduled_date: '2026-07-08', scheduled_start_time: '15:00:00', scheduled_end_time: '15:45:00' }

  test('computeOffsetMinutes', () => {
    expect(computeOffsetMinutes(parent, subA)).toBe(15)
    expect(computeOffsetMinutes(parent, subB)).toBe(60)
  })

  test('offset across days counts whole days', () => {
    const nextDayChild = { ...subA, scheduled_date: '2026-07-09' }
    expect(computeOffsetMinutes(parent, nextDayChild)).toBe(15 + 24 * 60)
  })

  test('parent Wed 2pm → Fri 10am carries children with offsets intact', () => {
    // Spec: Parent moves to Fri 10:00; A → 10:15–10:45, B → 11:00–11:45
    const movedA = applyOffsetToChild('2026-07-10', '10:00:00', subA, 15)
    expect(movedA).toEqual({ scheduled_date: '2026-07-10', scheduled_start_time: '10:15:00', scheduled_end_time: '10:45:00' })

    const movedB = applyOffsetToChild('2026-07-10', '10:00:00', subB, 60)
    expect(movedB).toEqual({ scheduled_date: '2026-07-10', scheduled_start_time: '11:00:00', scheduled_end_time: '11:45:00' })
  })

  test('child pushed past midnight rolls to the next day', () => {
    const lateChild = { scheduled_date: '2026-07-08', scheduled_start_time: '23:00:00', scheduled_end_time: '23:30:00' }
    // Parent lands at 23:30 with a +60min offset → child start would be 00:30 next day
    const moved = applyOffsetToChild('2026-07-10', '23:30:00', lateChild, 60)
    expect(moved.scheduled_date).toBe('2026-07-11')
    expect(moved.scheduled_start_time).toBe('00:30:00')
    expect(moved.scheduled_end_time).toBe('01:00:00')
  })

  test('child clamped so it never spans midnight', () => {
    const child = { scheduled_date: '2026-07-08', scheduled_start_time: '15:00:00', scheduled_end_time: '16:00:00' }
    // Offset lands the child at 23:30 with a 60-minute duration → clamp to 23:00–24:00
    const moved = applyOffsetToChild('2026-07-10', '23:30:00', child, 0)
    expect(moved.scheduled_end_time).toBe('24:00:00')
    expect(parseTimeToMinutes(moved.scheduled_end_time) - parseTimeToMinutes(moved.scheduled_start_time)).toBe(60)
  })
})

describe('computeLanes (overlap layout)', () => {
  const b = (id, start, end) => ({ id, scheduled_start_time: start, scheduled_end_time: end })

  test('non-overlapping blocks each get a full-width lane', () => {
    const lanes = computeLanes([b('a', '09:00:00', '10:00:00'), b('b', '10:00:00', '11:00:00')])
    expect(lanes.a).toEqual({ lane: 0, laneCount: 1 })
    expect(lanes.b).toEqual({ lane: 0, laneCount: 1 })
  })

  test('overlapping blocks split into side-by-side lanes', () => {
    const lanes = computeLanes([b('a', '09:00:00', '11:00:00'), b('b', '10:00:00', '12:00:00')])
    expect(lanes.a.laneCount).toBe(2)
    expect(lanes.b.laneCount).toBe(2)
    expect(lanes.a.lane).not.toBe(lanes.b.lane)
  })

  test('a third block after the cluster reuses full width', () => {
    const lanes = computeLanes([
      b('a', '09:00:00', '11:00:00'),
      b('b', '10:00:00', '12:00:00'),
      b('c', '13:00:00', '14:00:00'),
    ])
    expect(lanes.c).toEqual({ lane: 0, laneCount: 1 })
  })
})
