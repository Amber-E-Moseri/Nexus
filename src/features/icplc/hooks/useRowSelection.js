import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  allShownSelected,
  pruneToVisible,
  selectAllShown as selectAllShownOf,
  selectedRowsOf,
  toggleId,
  visibleIdsOf,
} from '../lib/bulkSelection.js'

/**
 * Shared participant selection for the ICPLC tables.
 *
 * - Selection is a Set of participant IDs. Never row indexes.
 * - It can only contain rows that are currently rendered: whoever renders the rows calls `syncShown(rows)`
 *   with exactly what is on screen (after every filter, including the Not Attending toggle and column
 *   filters). Anything that left the view is dropped immediately, so hidden people are never silently selected.
 * - `resetKey` summarises the filters. When it changes the selection is cleared.
 * - "Select all shown" selects exactly the shown rows. There is no pagination and no "select all N results".
 */
export function useRowSelection({ resetKey = '' } = {}) {
  const [selected, setSelected] = useState(() => new Set())
  const [shown, setShown] = useState([])
  const shownRef = useRef([])

  const syncShown = useCallback((rows) => {
    const next = rows || []
    // Cheap identity check keeps this safe to call from an effect on every render.
    const prev = shownRef.current
    if (prev === next) return
    const same = prev.length === next.length && prev.every((r, i) => r === next[i])
    if (same) return
    shownRef.current = next
    setShown(next)
    setSelected((cur) => {
      const pruned = pruneToVisible(cur, next)
      return pruned.size === cur.size ? cur : pruned
    })
  }, [])

  // A material filter change clears the selection.
  const lastKey = useRef(resetKey)
  useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey
      setSelected((cur) => (cur.size ? new Set() : cur))
    }
  }, [resetKey])

  const toggle = useCallback((id) => setSelected((cur) => toggleId(cur, id)), [])
  const selectAllShown = useCallback(() => setSelected(selectAllShownOf(shownRef.current)), [])
  const clear = useCallback(() => setSelected((cur) => (cur.size ? new Set() : cur)), [])

  // Derived, so a stale entry can never leak even for a render.
  const selectedRows = useMemo(() => selectedRowsOf(selected, shown), [selected, shown])
  const selectedIds = useMemo(() => selectedRows.map((r) => r.id), [selectedRows])
  const shownIds = useMemo(() => visibleIdsOf(shown), [shown])
  const effective = useMemo(() => new Set(selectedIds), [selectedIds])

  return {
    selectedIds,
    selectedRows,
    shownRows: shown,
    shownIds,
    count: selectedIds.length,
    isSelected: (id) => effective.has(id),
    allShownSelected: allShownSelected(effective, shown),
    someSelected: selectedIds.length > 0 && !allShownSelected(effective, shown),
    toggle,
    selectAllShown,
    toggleAllShown: () => (allShownSelected(effective, shown) ? clear() : selectAllShown()),
    clear,
    syncShown,
  }
}
