import { describe, it, expect } from 'vitest'

/**
 * extractedDataRender.test.js
 *
 * Pure-logic tests for the data-shape handling in AudioTranscriptionPanel.
 *
 * The component uses these guards when rendering extracted fields:
 *   decisions    : typeof d === 'string' ? d : d.decision
 *   action_items : item.title  (schema always has objects; accessed by property)
 *
 * Tests do NOT render JSX — they validate the branching logic directly
 * so they run fast and without a DOM.
 */

// ── Helper: mirrors the component's decision render logic ─────────────────────
function renderDecisionText(d) {
  return typeof d === 'string' ? d : d.decision
}

function renderDecisionContext(d) {
  if (typeof d === 'string') return null
  return d.context || null
}

// ── Helper: mirrors the component's action_item render logic ──────────────────
function renderActionItemTitle(item) {
  return item.title
}

function renderActionItemMeta(item) {
  return {
    owner: item.owner || 'TBD',
    due_date: item.due_date || null,
  }
}

// ── decisions — object array (v2.1 schema) ────────────────────────────────────
describe('decisions — object array (v2.1 shape)', () => {
  const decisions = [
    { decision: 'Adopt new meeting format', context: 'Agreed after pilot feedback' },
    { decision: 'Freeze budget until Q4', context: '' },
    { decision: 'Move standup to 9am', context: 'No context provided' },
  ]

  it('extracts .decision text from each object', () => {
    const texts = decisions.map(renderDecisionText)
    expect(texts).toEqual([
      'Adopt new meeting format',
      'Freeze budget until Q4',
      'Move standup to 9am',
    ])
  })

  it('returns context string when present and non-empty', () => {
    expect(renderDecisionContext(decisions[0])).toBe('Agreed after pilot feedback')
  })

  it('returns null for context when context is empty string', () => {
    expect(renderDecisionContext(decisions[1])).toBeNull()
  })

  it('does not crash when context key is missing entirely', () => {
    const d = { decision: 'Some decision' } // no context key at all
    expect(() => renderDecisionContext(d)).not.toThrow()
    expect(renderDecisionContext(d)).toBeNull()
  })
})

// ── decisions — string array (old/legacy shape, defensive guard) ──────────────
describe('decisions — string array (legacy shape)', () => {
  const decisions = ['Approve budget', 'Reschedule event', 'Assign tech lead']

  it('renders string directly without crash', () => {
    const texts = decisions.map(renderDecisionText)
    expect(texts).toEqual(['Approve budget', 'Reschedule event', 'Assign tech lead'])
  })

  it('returns null for context (strings have no context)', () => {
    decisions.forEach((d) => {
      expect(renderDecisionContext(d)).toBeNull()
    })
  })
})

// ── decisions — undefined / missing field ─────────────────────────────────────
describe('decisions — undefined (optional chaining guard)', () => {
  it('optional chain on undefined does not throw', () => {
    const extractedData = {}
    // This mirrors: extractedData.decisions?.length > 0 && extractedData.decisions.map(...)
    expect(() => {
      const decisions = extractedData.decisions
      const hasDecisions = decisions?.length > 0
      if (hasDecisions) {
        decisions.map(renderDecisionText)
      }
    }).not.toThrow()
  })

  it('optional chain on null does not throw', () => {
    const extractedData = { decisions: null }
    expect(() => {
      const hasDecisions = extractedData.decisions?.length > 0
      if (hasDecisions) {
        extractedData.decisions.map(renderDecisionText)
      }
    }).not.toThrow()
  })

  it('optional chain on empty array yields no items', () => {
    const extractedData = { decisions: [] }
    const hasDecisions = extractedData.decisions?.length > 0
    expect(hasDecisions).toBe(false)
  })
})

// ── action_items — object array (v2.1 schema) ─────────────────────────────────
describe('action_items — object array (v2.1 shape)', () => {
  const action_items = [
    { title: 'Book venue', owner: 'Sarah', due_date: '2026-07-10', priority: 'high', owner_confidence: 'explicit', suggested_space: 'Admin', space_confidence: 'high' },
    { title: 'Send invites', owner: null, due_date: null, priority: 'medium', owner_confidence: 'unassigned', suggested_space: null, space_confidence: 'ambiguous' },
    { title: 'Prepare slides', owner: 'TBD', due_date: '2026-07-05', priority: 'low', owner_confidence: 'unassigned', suggested_space: 'Media', space_confidence: 'low' },
  ]

  it('extracts .title from each item', () => {
    const titles = action_items.map(renderActionItemTitle)
    expect(titles).toEqual(['Book venue', 'Send invites', 'Prepare slides'])
  })

  it('falls back to "TBD" when owner is null', () => {
    const meta = renderActionItemMeta(action_items[1])
    expect(meta.owner).toBe('TBD')
  })

  it('falls back to "TBD" when owner is already "TBD"', () => {
    const meta = renderActionItemMeta(action_items[2])
    expect(meta.owner).toBe('TBD')
  })

  it('returns due_date string when present', () => {
    const meta = renderActionItemMeta(action_items[0])
    expect(meta.due_date).toBe('2026-07-10')
  })

  it('returns null due_date when absent', () => {
    const meta = renderActionItemMeta(action_items[1])
    expect(meta.due_date).toBeNull()
  })
})

// ── action_items — undefined / missing field ──────────────────────────────────
describe('action_items — undefined (optional chaining guard)', () => {
  it('optional chain on undefined does not throw', () => {
    const extractedData = {}
    expect(() => {
      const hasItems = extractedData.action_items?.length > 0
      if (hasItems) {
        extractedData.action_items.map(renderActionItemTitle)
      }
    }).not.toThrow()
  })

  it('optional chain on null does not throw', () => {
    const extractedData = { action_items: null }
    expect(() => {
      const hasItems = extractedData.action_items?.length > 0
      if (hasItems) {
        extractedData.action_items.map(renderActionItemTitle)
      }
    }).not.toThrow()
  })

  it('optional chain on empty array yields no items', () => {
    const extractedData = { action_items: [] }
    const hasItems = extractedData.action_items?.length > 0
    expect(hasItems).toBe(false)
  })
})

// ── mixed-shape resilience (both old strings and new objects in same array) ───
describe('decisions — mixed old/new shapes in same array (edge case)', () => {
  const mixed = [
    'A plain string decision',
    { decision: 'An object decision', context: 'Some context' },
  ]

  it('renders both shapes without throwing', () => {
    expect(() => mixed.map(renderDecisionText)).not.toThrow()
  })

  it('extracts correct text from each shape', () => {
    const texts = mixed.map(renderDecisionText)
    expect(texts[0]).toBe('A plain string decision')
    expect(texts[1]).toBe('An object decision')
  })

  it('returns null context for string items, real context for object items', () => {
    expect(renderDecisionContext(mixed[0])).toBeNull()
    expect(renderDecisionContext(mixed[1])).toBe('Some context')
  })
})
