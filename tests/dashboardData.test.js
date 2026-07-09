/**
 * BLW-02 — consolidated dashboard data helpers.
 */

import { describe, it, expect } from 'vitest'
import { groupOverdueByMember } from '../src/features/dashboard/lib/overdue.js'

describe('groupOverdueByMember', () => {
  it('groups RPC rows (assignee_name) by member, most overdue first', () => {
    const rows = [
      { id: 't1', title: 'A', assignee_id: 'u1', assignee_name: 'Alice', due_date: '2026-07-01' },
      { id: 't2', title: 'B', assignee_id: 'u2', assignee_name: 'Bob', due_date: '2026-07-02' },
      { id: 't3', title: 'C', assignee_id: 'u2', assignee_name: 'Bob', due_date: '2026-07-03' },
    ]
    const grouped = groupOverdueByMember(rows)
    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toMatchObject({ id: 'u2', name: 'Bob' })
    expect(grouped[0].tasks).toHaveLength(2)
    expect(grouped[1]).toMatchObject({ id: 'u1', name: 'Alice' })
  })

  it('supports the legacy embedded assignee shape', () => {
    const rows = [
      { id: 't1', assignee_id: 'u1', assignee: { id: 'u1', name: 'Alice' }, due_date: '2026-07-01' },
    ]
    const grouped = groupOverdueByMember(rows)
    expect(grouped[0].name).toBe('Alice')
  })

  it('falls back to Unknown when no name is present and handles empty input', () => {
    expect(groupOverdueByMember([])).toEqual([])
    const grouped = groupOverdueByMember([{ id: 't1', assignee_id: 'u9' }])
    expect(grouped[0].name).toBe('Unknown')
  })
})
