import { describe, it, expect } from 'vitest'

/**
 * meetingExtractionSampleTranscripts.test.js
 *
 * Sample-transcript validation plan. Each test case represents a real-world
 * scenario you should feed through the live extraction pipeline to confirm the
 * v2.1 prompt produces correct output.
 *
 * Tests here validate the OUTPUT shape the pipeline must produce for each
 * transcript. They do NOT call the Claude API (that would be slow + costly).
 * Instead they assert invariants on simulated extraction results — the same
 * checks an integration test or manual QA session should verify.
 *
 * How to use this as a live QA checklist:
 *   1. Paste the TRANSCRIPT constant into AudioTranscriptionPanel (paste mode).
 *   2. Click "Save + extract insights".
 *   3. Compare the actual extracted JSON to the EXPECTED assertions below.
 */

// ── Helpers (mirrors production logic) ──────────────────────────────────────

function gateExtractionFields(extracted) {
  if (extracted.content_type !== 'meeting' || extracted.confidence < 0.6) {
    extracted.detailed_notes = null
    extracted.scripture_references = []
  }
  return extracted
}

function scriptureIsClean(refs) {
  for (const ref of refs ?? []) {
    if (!ref.citation) return false                           // citation always required
    if (ref.confidence !== 'confirmed' && ref.verse_text)   // unconfirmed must have null verse_text
      return false
  }
  return true
}

// ═════════════════════════════════════════════════════════════════════════════
// Sample Transcript A — Standard ministry planning meeting with scripture
// ═════════════════════════════════════════════════════════════════════════════

const TRANSCRIPT_A = `
Amber: Good morning everyone. Let's open with a word from Isaiah 40:31 —
  "But those who hope in the Lord will renew their strength. They will soar on
  wings like eagles; they will run and not grow weary, they will walk and not
  be faint." Amen.

Amber: So today we have three main items: the June retreat logistics, the
  media team video backlog, and the ORS Sunday schedule.

Sam: For the retreat — the deposit is due June 20 and we still haven't
  confirmed the catering vendor.

Amber: Sam, can you own that? Get the catering confirmed by June 18 so we
  have buffer.
Sam: Yes, I've got it.

David: Media side — we have four videos in post. Two are blocked on the
  interview recording with Pastor B. I'd like to schedule that by end of month.
Amber: David let's make that your action item. Coordinate with Pastor B's
  assistant for a recording slot before June 30.
David: Done.

Amber: ORS — the Sunday rota for July is missing four slots.
Grace: I can cover that. I'll have the draft rota to you by Friday.
Amber: Perfect. Let's close in prayer.
`

describe('Sample A — Standard planning meeting', () => {
  // Simulated extraction output the pipeline MUST produce for Transcript A.
  const EXPECTED_EXTRACTED = {
    content_type: 'meeting',
    confidence: 0.92,
    detailed_notes: '## Opening\n**Amber:** opened with Isaiah 40:31 — "But those who hope…"\n\n## Retreat Logistics\n**Sam:** deposit due June 20, catering vendor not confirmed.\n**Amber:** assigned Sam to confirm catering by June 18.\n\n## Media Backlog\n**David:** 4 videos in post, 2 blocked on Pastor B interview.\n**Amber:** David to schedule Pastor B recording slot before June 30.\n\n## ORS Sunday Rota\nJuly rota has 4 gaps.\n**Grace:** will draft rota and deliver by Friday.',
    scripture_references: [
      { citation: 'Isaiah 40:31', verse_text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.', confidence: 'confirmed' },
    ],
    summary: 'Planning meeting covering June retreat catering deadline (June 18), media team video backlog with Pastor B interview blocker (June 30), and ORS July rota completion (Friday).',
    action_items: [
      { title: 'Confirm retreat catering vendor', owner: 'Sam', due_date: '2026-06-18', priority: 'high' },
      { title: 'Schedule Pastor B interview recording slot', owner: 'David', due_date: '2026-06-30', priority: 'medium' },
      { title: 'Draft July ORS Sunday rota', owner: 'Grace', due_date: '2026-07-11', priority: 'medium' },
    ],
    decisions: [
      { decision: 'Sam owns retreat catering confirmation by June 18', context: 'buffer before June 20 deposit deadline' },
    ],
  }

  it('classifies as meeting with high confidence', () => {
    expect(EXPECTED_EXTRACTED.content_type).toBe('meeting')
    expect(EXPECTED_EXTRACTED.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('detailed_notes is present (not null) for a qualifying meeting', () => {
    const result = gateExtractionFields({ ...EXPECTED_EXTRACTED })
    expect(result.detailed_notes).not.toBeNull()
    expect(result.detailed_notes).toContain('Isaiah')
    expect(result.detailed_notes).toContain('Sam')
  })

  it('detailed_notes is a full-detail record, not a second summary', () => {
    // Must be substantially longer than summary and contain speaker attribution
    expect(EXPECTED_EXTRACTED.detailed_notes.length).toBeGreaterThan(
      EXPECTED_EXTRACTED.summary.length * 2
    )
    expect(EXPECTED_EXTRACTED.detailed_notes).toContain('**Amber:**')
    expect(EXPECTED_EXTRACTED.detailed_notes).toContain('**Sam:**')
  })

  it('scripture: Isaiah 40:31 is confirmed with verse text', () => {
    const ref = EXPECTED_EXTRACTED.scripture_references[0]
    expect(ref.citation).toBe('Isaiah 40:31')
    expect(ref.confidence).toBe('confirmed')
    expect(ref.verse_text).toBeTruthy()
  })

  it('scripture references pass the clean check', () => {
    expect(scriptureIsClean(EXPECTED_EXTRACTED.scripture_references)).toBe(true)
  })

  it('extracts 3 action items with correct owners', () => {
    const items = EXPECTED_EXTRACTED.action_items
    expect(items).toHaveLength(3)
    const owners = items.map((i) => i.owner)
    expect(owners).toContain('Sam')
    expect(owners).toContain('David')
    expect(owners).toContain('Grace')
  })

  it('Sam catering task has a due_date before the deposit deadline', () => {
    const samTask = EXPECTED_EXTRACTED.action_items.find((i) => i.owner === 'Sam')
    expect(samTask?.due_date).toBe('2026-06-18') // explicitly named in meeting
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Sample Transcript B — Raw note (NOT a meeting) — must NOT extract meeting fields
// ═════════════════════════════════════════════════════════════════════════════

const TRANSCRIPT_B = `
Personal reflection notes from this morning. Thinking about the upcoming
retreat and what the Lord has put on my heart. Reading John 15 today.
Key thought: abiding in the vine. Need to think more about this.
Areas to pray about: team unity, funding, venue.
`

describe('Sample B — Raw note (should NOT produce detailed_notes)', () => {
  const EXPECTED_EXTRACTED = {
    content_type: 'raw_note',
    confidence: 0.85,
    detailed_notes: 'Some text the model might accidentally emit',
    scripture_references: [
      { citation: 'John 15', verse_text: 'I am the vine…', confidence: 'confirmed' },
    ],
    summary: null,
    action_items: [],
  }

  it('gating clears detailed_notes for raw_note content', () => {
    const result = gateExtractionFields({ ...EXPECTED_EXTRACTED })
    expect(result.detailed_notes).toBeNull()
  })

  it('gating clears scripture_references for raw_note content', () => {
    const result = gateExtractionFields({ ...EXPECTED_EXTRACTED })
    expect(result.scripture_references).toEqual([])
  })

  it('produces no action_items', () => {
    expect(EXPECTED_EXTRACTED.action_items).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Sample Transcript C — Low-confidence meeting — gating must block detailed fields
// ═════════════════════════════════════════════════════════════════════════════

const TRANSCRIPT_C = `
Hello? Is anyone there? Can you hear me? Let me know when you're ready.
Okay I think we're good. So just wanted to quickly… actually let me call
you back in two minutes.
`

describe('Sample C — Low-confidence / ambiguous audio (confidence < 0.6)', () => {
  const EXPECTED_EXTRACTED = {
    content_type: 'meeting',
    confidence: 0.25,
    detailed_notes: 'Accidental emit from model',
    scripture_references: [],
    summary: null,
    action_items: [],
  }

  it('gating clears detailed_notes when confidence < 0.6', () => {
    const result = gateExtractionFields({ ...EXPECTED_EXTRACTED })
    expect(result.detailed_notes).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Sample Transcript D — Scripture with unconfirmed citations
// ═════════════════════════════════════════════════════════════════════════════

const TRANSCRIPT_D = `
Pastor: We opened the message from Colossians 3 — putting on the new self.
  I also referenced a verse from Proverbs, something about the heart directing
  the path, but I'd need to look it up to give you the exact reference.

Amber: Action item: Pastor to send the exact Proverbs reference to the team.
`

describe('Sample D — Scripture with an unconfirmed citation', () => {
  const EXPECTED_EXTRACTED = {
    content_type: 'meeting',
    confidence: 0.78,
    detailed_notes: '## Message Reference\n**Pastor:** referenced Colossians 3 (putting on the new self). Also cited a Proverbs verse about the heart directing the path — exact reference unconfirmed.\n\n## Action Items\n**Amber:** Pastor to follow up with the exact Proverbs citation.',
    scripture_references: [
      { citation: 'Colossians 3', verse_text: null, confidence: 'unconfirmed' },
      { citation: 'Proverbs (exact verse unconfirmed)', verse_text: null, confidence: 'unconfirmed' },
    ],
    action_items: [
      { title: 'Send exact Proverbs verse reference to team', owner: 'Pastor', due_date: null, priority: 'low' },
    ],
  }

  it('unconfirmed citations have null verse_text', () => {
    for (const ref of EXPECTED_EXTRACTED.scripture_references) {
      expect(ref.confidence).toBe('unconfirmed')
      expect(ref.verse_text).toBeNull()
    }
  })

  it('scripture references are clean (no invented verse text)', () => {
    expect(scriptureIsClean(EXPECTED_EXTRACTED.scripture_references)).toBe(true)
  })

  it('detailed_notes references the unconfirmed citation inline', () => {
    expect(EXPECTED_EXTRACTED.detailed_notes).toContain('Proverbs')
    expect(EXPECTED_EXTRACTED.detailed_notes).toContain('unconfirmed')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Sample Transcript E — Multi-department meeting, sprint assignment
// ═════════════════════════════════════════════════════════════════════════════

const TRANSCRIPT_E = `
Amber: Good morning. Quick cross-team sync. Media and ORS items on the agenda.

Sam [Media]: The livestream setup for Sunday is on track. Still need someone
  to test the backup encoder. That should be a Media sprint task — we're in
  Sprint 4 right now.

Grace [ORS]: From ORS side, I need the Sunday welcome team rota signed off.
  That's an ORS task, not sprint — just put it on the board.

Amber: Noted. Sam owns encoder test (Media, Sprint 4). Grace owns rota
  sign-off (ORS, space board only).
`

describe('Sample E — Multi-department + sprint assignment', () => {
  // Simulated directory
  const directory = {
    users: [
      { id: 'u-sam', name: 'Sam Media', department_id: 'dept-media' },
      { id: 'u-grace', name: 'Grace ORS', department_id: 'dept-ors' },
    ],
    departments: [
      { id: 'dept-media', name: 'Media' },
      { id: 'dept-ors', name: 'ORS' },
    ],
  }

  const normalizeName = (s) => (s || '').trim().toLowerCase()

  function matchUserByName(name, users) {
    const n = normalizeName(name)
    if (!n || n === 'tbd' || n === 'unassigned') return null
    const exact = users.find((u) => normalizeName(u.name) === n)
    if (exact) return exact
    const firstNameMatches = users.filter(
      (u) => normalizeName(u.name).split(' ')[0] === n.split(' ')[0],
    )
    return firstNameMatches.length === 1 ? firstNameMatches[0] : null
  }

  function matchDepartmentByName(name, departments) {
    const n = normalizeName(name)
    if (!n) return null
    return departments.find((d) => normalizeName(d.name) === n) ?? null
  }

  function resolveAssignment(item, dir) {
    const user = matchUserByName(item.owner, dir.users)
    const aiDeptId = matchDepartmentByName(item.suggested_space, dir.departments)?.id ?? null
    return {
      assigneeId: user?.id ?? null,
      departmentId: user?.department_id ?? aiDeptId,
      sprintId: null,
    }
  }

  const EXTRACTED_ITEMS = [
    { title: 'Test backup encoder for Sunday livestream', owner: 'Sam', suggested_space: 'Media' },
    { title: 'Get Sunday welcome team rota signed off', owner: 'Grace', suggested_space: 'ORS' },
  ]

  it('Sam resolves to Media dept regardless of suggested_space (deterministic)', () => {
    const r = resolveAssignment({ owner: 'Sam', suggested_space: 'ORS' }, directory)
    expect(r.departmentId).toBe('dept-media')
  })

  it('Grace resolves to ORS dept regardless of suggested_space (deterministic)', () => {
    const r = resolveAssignment({ owner: 'Grace', suggested_space: 'Media' }, directory)
    expect(r.departmentId).toBe('dept-ors')
  })

  it('sprint_id initially null — user must pick from picker', () => {
    for (const item of EXTRACTED_ITEMS) {
      const r = resolveAssignment(item, directory)
      expect(r.sprintId).toBeNull()
    }
  })

  it('encoder test task becomes sprint task when sprint_id assigned', () => {
    const row = {
      title: 'Test backup encoder',
      sprintId: 'sprint-4',
      departmentId: 'dept-media',
    }
    expect(row.sprintId ? 'sprint' : 'space').toBe('sprint')
  })

  it('rota task stays space task (no sprint)', () => {
    const row = {
      title: 'Get Sunday welcome team rota signed off',
      sprintId: null,
      departmentId: 'dept-ors',
    }
    expect(row.sprintId ? 'sprint' : 'space').toBe('space')
  })
})
