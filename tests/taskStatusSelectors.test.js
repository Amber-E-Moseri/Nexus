/**
 * Regression test for the "personal task set to To Do lands in Other" bug.
 *
 * Root cause (see migration 20270723000004): canonical org-wide status rows
 * had their department_id incorrectly set to a specific department instead
 * of NULL, so personal task creation only ever saw legacy duplicate rows
 * sharing the same name/category. dedupeTaskStatuses collapsed a canonical
 * + duplicate collision by first-seen order rather than preferring the
 * canonical row -- this test guards that tie-break.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { dedupeTaskStatuses } from '../src/lib/taskStatusSelectors'

describe('dedupeTaskStatuses', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const canonical = {
    id: 'canonical-id',
    name: 'To Do',
    category: 'open',
    is_org_status: true,
    legacy_key: 'to_do',
    active: true,
    sort_order: 0,
  }
  const duplicate = {
    id: 'duplicate-id',
    name: 'To Do',
    category: 'open',
    is_org_status: false,
    legacy_key: null,
    active: true,
    sort_order: 0,
  }

  it('prefers the canonical (is_org_status) row when it sorts second', () => {
    const merged = dedupeTaskStatuses([duplicate, canonical])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('canonical-id')
    expect(merged[0]._mergedIds).toEqual(expect.arrayContaining(['canonical-id', 'duplicate-id']))
  })

  it('prefers the canonical (is_org_status) row when it sorts first', () => {
    const merged = dedupeTaskStatuses([canonical, duplicate])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('canonical-id')
    expect(merged[0]._mergedIds).toEqual(expect.arrayContaining(['canonical-id', 'duplicate-id']))
  })

  it('prefers a row with a non-null legacy_key over one without, absent is_org_status', () => {
    const withLegacyKey = { ...duplicate, id: 'a', is_org_status: false, legacy_key: 'to_do' }
    const withoutLegacyKey = { ...duplicate, id: 'b', is_org_status: false, legacy_key: null }
    const merged = dedupeTaskStatuses([withoutLegacyKey, withLegacyKey])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a')
  })

  it('warns instead of silently picking when neither duplicate is canonical', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = { ...duplicate, id: 'a', is_org_status: false, legacy_key: null }
    const b = { ...duplicate, id: 'b', is_org_status: false, legacy_key: null }
    const merged = dedupeTaskStatuses([a, b])
    expect(merged).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/no clear winner/i)
  })

  it('warns instead of silently picking when both duplicates look canonical', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = { ...canonical, id: 'a' }
    const b = { ...canonical, id: 'b' }
    const merged = dedupeTaskStatuses([a, b])
    expect(merged).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/canonical-looking/i)
  })

  it('does not warn on the normal canonical-vs-duplicate case', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    dedupeTaskStatuses([duplicate, canonical])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('leaves distinct categories/names unmerged', () => {
    const inProgress = { ...canonical, id: 'ip', name: 'In Progress', category: 'in_progress', legacy_key: 'in_progress' }
    const merged = dedupeTaskStatuses([canonical, inProgress])
    expect(merged).toHaveLength(2)
  })
})
