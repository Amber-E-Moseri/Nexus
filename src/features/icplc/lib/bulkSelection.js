// Pure helpers behind the shared row selection (hooks/useRowSelection.js). Kept free of React so the
// rules are unit-tested: selection is a set of canonical participant IDs, never row indexes, and it can
// only ever contain rows that are currently rendered.

/** Distinct, non-empty IDs in first-seen order. */
export function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))]
}

/** IDs of the rows currently shown, deduplicated. */
export function visibleIdsOf(rows) {
  return uniqueIds((rows || []).map((r) => r?.id))
}

/** Keep only the selected IDs that are still shown. A row that leaves the view is deselected for good. */
export function pruneToVisible(selected, rows) {
  const visible = new Set(visibleIdsOf(rows))
  return new Set([...(selected || [])].filter((id) => visible.has(id)))
}

export function toggleId(selected, id) {
  const next = new Set(selected || [])
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** "Select all shown": exactly the rendered rows, nothing else. */
export function selectAllShown(rows) {
  return new Set(visibleIdsOf(rows))
}

/** The shown rows that are selected, in display order. */
export function selectedRowsOf(selected, rows) {
  const seen = new Set()
  const out = []
  for (const r of rows || []) {
    if (r?.id && selected.has(r.id) && !seen.has(r.id)) { seen.add(r.id); out.push(r) }
  }
  return out
}

export function allShownSelected(selected, rows) {
  const ids = visibleIdsOf(rows)
  return ids.length > 0 && ids.every((id) => selected.has(id))
}

/**
 * People list Not Attending default. Not Attending participants are hidden unless staff turned on
 * "Include not attending" or explicitly asked for Not Attending in the Participation filter. Selection is
 * built from the rows this returns, so a hidden Not Attending participant can never be selected.
 */
export function applyAbsentVisibility(rows, { showAbsent = false, participationFilter = [] } = {}) {
  const explicit = (participationFilter || []).includes('not_attending')
  if (showAbsent || explicit) return rows || []
  return (rows || []).filter((p) => p?.participation_status !== 'not_attending')
}
