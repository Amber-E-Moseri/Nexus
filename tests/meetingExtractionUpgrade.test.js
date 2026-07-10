import { describe, it, expect } from 'vitest'

/**
 * meetingExtractionUpgrade.test.js
 *
 * Pure-logic coverage for the four meeting-extraction upgrades:
 *   Phase 2 — detailed_notes + scripture gating
 *   Phase 3 — deterministic department resolution
 *   Phase 4 — sprint_id on task creation (extraction flow + TaskModal)
 *
 * Following the repo convention (see extractedDataRender.test.js), these tests
 * MIRROR the component/lib logic rather than importing the DOM/supabase-heavy
 * modules, so they run fast and headless. Each helper below is copied verbatim
 * from its source of truth; the comment names that source.
 */

// ── Mirrors: extract-meeting-data/index.ts STEP 2 gate ────────────────────────
// detailed_notes, scripture_references, summary, decisions, action_items only
// populate when the content is a meeting with confidence >= 0.6.
function qualifiesAsMeeting({ content_type, confidence }) {
  return content_type === 'meeting' && confidence >= 0.6
}

// ── Mirrors: AudioTranscriptionPanel ScriptureChip display rule ───────────────
// The UI only surfaces verse_text when the model marked the citation confirmed.
// An unconfirmed citation NEVER shows reconstructed verse text — the badge only.
function scriptureDisplay(ref) {
  const confirmed = ref?.confidence === 'confirmed' && !!ref?.verse_text
  return {
    citation: ref?.citation ?? null,
    confirmed,
    // verse text is exposed ONLY when confirmed
    shownVerseText: confirmed ? ref.verse_text : null,
    badge: confirmed ? '✓' : '?',
  }
}

// ── Mirrors: AudioTranscriptionPanel matchUserByName / matchDepartmentByName /
//    resolveAssignment ─────────────────────────────────────────────────────────
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

function resolveAssignment(item, directory) {
  const user = matchUserByName(item.owner, directory.users)
  const aiDeptId = matchDepartmentByName(item.suggested_space, directory.departments)?.id ?? null
  return {
    assigneeId: user?.id ?? null,
    departmentId: user?.department_id ?? aiDeptId,
    sprintId: null,
  }
}

// ── Mirrors: meetings.js createTasksFromActionItems sprint mapping ────────────
function buildTaskRow(item, meetingDeptId) {
  const destDeptId = item.departmentId ?? meetingDeptId
  return {
    title: item.title,
    department_id: destDeptId,
    sprint_id: item.sprintId || null,
    task_type: item.sprintId ? 'sprint' : 'space',
  }
}

// ── Mirrors: TaskModal handleSave sprint payload ──────────────────────────────
function buildTaskModalPayload({ personal, selectedSprintId, selectedSpaceId, departmentId }) {
  const effectiveSprintId = personal ? null : selectedSprintId || null
  return {
    department_id: personal ? departmentId ?? null : effectiveSprintId ? null : (selectedSpaceId || departmentId) ?? null,
    sprint_id: effectiveSprintId,
    task_type: personal ? 'personal' : effectiveSprintId ? 'sprint' : 'space',
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Phase 2 — detailed_notes / scripture gating
// ═════════════════════════════════════════════════════════════════════════════
describe('Phase 2 — meeting-detail gating', () => {
  it('qualifies a confident meeting for detailed_notes', () => {
    expect(qualifiesAsMeeting({ content_type: 'meeting', confidence: 0.9 })).toBe(true)
    expect(qualifiesAsMeeting({ content_type: 'meeting', confidence: 0.6 })).toBe(true)
  })

  it('does NOT qualify a low-confidence meeting', () => {
    expect(qualifiesAsMeeting({ content_type: 'meeting', confidence: 0.5 })).toBe(false)
  })

  it('does NOT qualify non-meeting content regardless of confidence', () => {
    for (const content_type of ['raw_note', 'list_data', 'other']) {
      expect(qualifiesAsMeeting({ content_type, confidence: 0.99 })).toBe(false)
    }
  })
})

describe('Phase 2 — scripture confidence gating (no invented verse text)', () => {
  it('shows verse text only for a confirmed citation', () => {
    const d = scriptureDisplay({ citation: 'John 3:16', verse_text: 'For God so loved the world…', confidence: 'confirmed' })
    expect(d.confirmed).toBe(true)
    expect(d.shownVerseText).toBe('For God so loved the world…')
    expect(d.badge).toBe('✓')
  })

  it('never shows verse text for an unconfirmed citation, even if text is present', () => {
    // Defends against a hallucinated verse arriving with confidence:unconfirmed.
    const d = scriptureDisplay({ citation: 'Hesitations 4:2', verse_text: 'A confidently wrong quote', confidence: 'unconfirmed' })
    expect(d.confirmed).toBe(false)
    expect(d.shownVerseText).toBeNull()
    expect(d.badge).toBe('?')
    expect(d.citation).toBe('Hesitations 4:2')
  })

  it('treats a confirmed flag with null verse_text as unconfirmed (nothing to show)', () => {
    const d = scriptureDisplay({ citation: 'Romans 8:28', verse_text: null, confidence: 'confirmed' })
    expect(d.confirmed).toBe(false)
    expect(d.shownVerseText).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Phase 3 — deterministic department resolution
// ═════════════════════════════════════════════════════════════════════════════
describe('Phase 3 — deterministic dept resolution', () => {
  const directory = {
    users: [
      { id: 'u-amber', name: 'Amber Moseri', department_id: 'dept-admin' },
      { id: 'u-sam', name: 'Sam Media', department_id: 'dept-media' },
    ],
    departments: [
      { id: 'dept-admin', name: 'Admin' },
      { id: 'dept-media', name: 'Media' },
      { id: 'dept-pfcc', name: 'PFCC' },
    ],
  }

  it("uses the matched user's real department, ignoring the AI's suggested_space", () => {
    // Owner resolves to Amber (Admin). AI wrongly guessed PFCC — must be ignored.
    const r = resolveAssignment({ owner: 'Amber Moseri', suggested_space: 'PFCC' }, directory)
    expect(r.assigneeId).toBe('u-amber')
    expect(r.departmentId).toBe('dept-admin') // deterministic from the user, not PFCC
    expect(r.sprintId).toBeNull()
  })

  it('resolves by unique first name and still uses that user department', () => {
    const r = resolveAssignment({ owner: 'Sam', suggested_space: 'Admin' }, directory)
    expect(r.assigneeId).toBe('u-sam')
    expect(r.departmentId).toBe('dept-media')
  })

  it('falls back to AI suggested_space only when the owner is unresolved', () => {
    const r = resolveAssignment({ owner: 'External Vendor', suggested_space: 'Media' }, directory)
    expect(r.assigneeId).toBeNull()
    expect(r.departmentId).toBe('dept-media') // fuzzy fallback used
  })

  it('leaves both null when owner unresolved and no valid suggested_space', () => {
    const r = resolveAssignment({ owner: 'TBD', suggested_space: 'Nonexistent' }, directory)
    expect(r.assigneeId).toBeNull()
    expect(r.departmentId).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Phase 4 — sprint_id on task creation
// ═════════════════════════════════════════════════════════════════════════════
describe('Phase 4 — extraction flow sets sprint_id + task_type', () => {
  it('sets sprint_id and task_type=sprint when an item has a sprint', () => {
    const row = buildTaskRow({ title: 'Ship deck', sprintId: 'sprint-1', departmentId: 'dept-media' }, 'dept-admin')
    expect(row.sprint_id).toBe('sprint-1')
    expect(row.task_type).toBe('sprint')
  })

  it('leaves sprint_id null and task_type=space when no sprint chosen', () => {
    const row = buildTaskRow({ title: 'Ship deck', departmentId: 'dept-media' }, 'dept-admin')
    expect(row.sprint_id).toBeNull()
    expect(row.task_type).toBe('space')
  })
})

describe('Phase 4 — TaskModal payload sprint linkage', () => {
  it('links a sprint: task_type=sprint and department cleared', () => {
    const p = buildTaskModalPayload({ personal: false, selectedSprintId: 'sprint-9', selectedSpaceId: 'dept-admin', departmentId: 'dept-admin' })
    expect(p.sprint_id).toBe('sprint-9')
    expect(p.task_type).toBe('sprint')
    expect(p.department_id).toBeNull()
  })

  it('no sprint: task_type=space with department set', () => {
    const p = buildTaskModalPayload({ personal: false, selectedSprintId: '', selectedSpaceId: 'dept-admin', departmentId: 'dept-admin' })
    expect(p.sprint_id).toBeNull()
    expect(p.task_type).toBe('space')
    expect(p.department_id).toBe('dept-admin')
  })

  it('personal tasks never get a sprint', () => {
    const p = buildTaskModalPayload({ personal: true, selectedSprintId: 'sprint-9', selectedSpaceId: 'dept-admin', departmentId: 'dept-admin' })
    expect(p.sprint_id).toBeNull()
    expect(p.task_type).toBe('personal')
  })
})
