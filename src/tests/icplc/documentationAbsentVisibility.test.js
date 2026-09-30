/**
 * Focused test: DocumentationPage absent-visibility toggle.
 * Tests the filter predicate logic directly — no React component rendering needed.
 */

import { describe, test, expect } from 'vitest'

// ── Filter predicate (mirrors DocumentationPage filtered useMemo) ─────────────
// showAbsent is the only variable under test; other filter args left at defaults.
function applyDocFilter(participants, showAbsent) {
  return participants.filter((p) => {
    if (!showAbsent && p.participation_status === 'not_attending') return false
    return true
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ACTIVE = { id: 'a1', full_name: 'Alice', participation_status: 'confirmed' }
const ABSENT = { id: 'b1', full_name: 'Bob',   participation_status: 'not_attending' }

describe('DocumentationPage — absent visibility toggle', () => {
  test('DA-01: active participant visible by default (showAbsent=false)', () => {
    const result = applyDocFilter([ACTIVE, ABSENT], false)
    expect(result.map((p) => p.id)).toContain('a1')
  })

  test('DA-02: not_attending participant hidden by default (showAbsent=false)', () => {
    const result = applyDocFilter([ACTIVE, ABSENT], false)
    expect(result.map((p) => p.id)).not.toContain('b1')
  })

  test('DA-03: Include absent (showAbsent=true) reveals not_attending participant', () => {
    const result = applyDocFilter([ACTIVE, ABSENT], true)
    expect(result.map((p) => p.id)).toContain('b1')
    expect(result.map((p) => p.id)).toContain('a1')
  })

  test('DA-04: turning Include absent off hides not_attending again', () => {
    const withAbsent = applyDocFilter([ACTIVE, ABSENT], true)
    expect(withAbsent).toHaveLength(2)
    const withoutAbsent = applyDocFilter([ACTIVE, ABSENT], false)
    expect(withoutAbsent).toHaveLength(1)
    expect(withoutAbsent[0].id).toBe('a1')
  })

  test('DA-05: filter does not mutate participant data', () => {
    const original = { ...ABSENT }
    applyDocFilter([ABSENT], false)
    expect(ABSENT.participation_status).toBe('not_attending')
    expect(ABSENT).toEqual(original)
  })
})
