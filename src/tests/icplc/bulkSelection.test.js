/**
 * Shared bulk selection: participant IDs only, only what is rendered, cleared by filter changes,
 * Not Attending hidden means never selected, no duplicate IDs.
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  allShownSelected,
  applyAbsentVisibility,
  pruneToVisible,
  selectAllShown,
  selectedRowsOf,
  toggleId,
  uniqueIds,
  visibleIdsOf,
} from '../../features/icplc/lib/bulkSelection.js'
import { useRowSelection } from '../../features/icplc/hooks/useRowSelection.js'

const row = (id, status = 'confirmed') => ({ id, full_name: `P ${id}`, participation_status: status })

describe('selection helpers', () => {
  it('SEL-1 individual selection toggles by participant id', () => {
    let s = new Set()
    s = toggleId(s, 'a')
    expect([...s]).toEqual(['a'])
    s = toggleId(s, 'a')
    expect(s.size).toBe(0)
  })

  it('SEL-2 select all shown is exactly the rendered rows', () => {
    const rows = [row('a'), row('b'), row('c')]
    expect([...selectAllShown(rows)]).toEqual(['a', 'b', 'c'])
    expect(allShownSelected(new Set(['a', 'b', 'c']), rows)).toBe(true)
    expect(allShownSelected(new Set(['a']), rows)).toBe(false)
  })

  it('SEL-3 only filtered rows: select all shown never reaches rows outside the filtered set', () => {
    const all = [row('a'), row('b'), row('c'), row('d')]
    const filtered = all.filter((r) => r.id !== 'c')
    const picked = selectAllShown(filtered)
    expect(picked.has('c')).toBe(false)
    expect(picked.size).toBe(3)
  })

  it('SEL-4 a row that leaves the view is dropped from the selection', () => {
    const pruned = pruneToVisible(new Set(['a', 'b', 'c']), [row('a'), row('c')])
    expect([...pruned].sort()).toEqual(['a', 'c'])
  })

  it('SEL-5 duplicate ids are impossible', () => {
    expect(uniqueIds(['a', 'a', 'b', null, 'b'])).toEqual(['a', 'b'])
    const dupRows = [row('a'), row('a'), row('b')]
    expect(visibleIdsOf(dupRows)).toEqual(['a', 'b'])
    expect(selectedRowsOf(new Set(['a', 'b']), dupRows).map((r) => r.id)).toEqual(['a', 'b'])
    expect(selectAllShown(dupRows).size).toBe(2)
  })

  it('SEL-6 People hides Not Attending by default and select all shown cannot reach them', () => {
    const rows = [row('a'), row('b', 'not_attending'), row('c', 'likely')]
    const shown = applyAbsentVisibility(rows, { showAbsent: false, participationFilter: [] })
    expect(shown.map((r) => r.id)).toEqual(['a', 'c'])
    expect(selectAllShown(shown).has('b')).toBe(false)
  })

  it('SEL-7 Include Not Attending, or asking for Not Attending in the filter, shows them', () => {
    const rows = [row('a'), row('b', 'not_attending')]
    expect(applyAbsentVisibility(rows, { showAbsent: true }).map((r) => r.id)).toEqual(['a', 'b'])
    expect(applyAbsentVisibility(rows, { participationFilter: ['not_attending'] }).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('useRowSelection', () => {
  const A = row('a')
  const B = row('b')
  const C = row('c')

  it('SEL-8 select all shown, then clear', () => {
    const { result } = renderHook(() => useRowSelection({ resetKey: 'k' }))
    act(() => result.current.syncShown([A, B, C]))
    act(() => result.current.selectAllShown())
    expect(result.current.selectedIds).toEqual(['a', 'b', 'c'])
    expect(result.current.allShownSelected).toBe(true)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('SEL-9 a filter change (resetKey) clears the selection', () => {
    const { result, rerender } = renderHook(({ k }) => useRowSelection({ resetKey: k }), { initialProps: { k: 'one' } })
    act(() => result.current.syncShown([A, B]))
    act(() => result.current.toggle('a'))
    expect(result.current.count).toBe(1)
    rerender({ k: 'two' })
    expect(result.current.count).toBe(0)
  })

  it('SEL-10 hidden rows never stay selected, even if they come back', () => {
    const { result } = renderHook(() => useRowSelection({ resetKey: 'k' }))
    act(() => result.current.syncShown([A, B, C]))
    act(() => result.current.selectAllShown())
    act(() => result.current.syncShown([A, C])) // B hidden (e.g. Not Attending toggled off)
    expect(result.current.selectedIds).toEqual(['a', 'c'])
    act(() => result.current.syncShown([A, B, C])) // B shown again
    expect(result.current.selectedIds).toEqual(['a', 'c']) // not silently re-selected
  })

  it('SEL-11 selection holds ids, so re-sorting the rows does not change what is selected', () => {
    const { result } = renderHook(() => useRowSelection({ resetKey: 'k' }))
    act(() => result.current.syncShown([A, B, C]))
    act(() => result.current.toggle('b'))
    act(() => result.current.syncShown([C, B, A]))
    expect(result.current.selectedIds).toEqual(['b'])
  })
})
