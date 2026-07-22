import { supabase } from '../../../lib/supabase'
import { callFlockCRM } from '../../../lib/flockSupabase'

// Adapted from src/components/flock/FlockAiLogPanel.jsx's levenshtein/
// matchPerson (duplicated intentionally — small, stable, and avoids a
// features/meetings -> components/flock cross-feature import).
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prev[j], prev[j - 1], prevDiag)
      prevDiag = tmp
    }
  }
  return prev[b.length]
}

function bestWordSimilarity(part, words) {
  let best = 0
  for (const w of words) {
    if (w.length < 2) continue
    if (w === part) return 1
    const dist = levenshtein(part, w)
    const sim = 1 - dist / Math.max(part.length, w.length)
    if (sim > best) best = sim
  }
  return best
}

// Same thresholding as FlockAiLogPanel.jsx's matchPerson — returns '' when
// there's no confident match rather than guessing.
function matchPersonByName(name, contacts) {
  const lower = String(name || '').toLowerCase()
  const words = lower.split(/[^a-z0-9']+/).filter(Boolean)
  const scored = contacts.map((c) => {
    const nameLower = String(c.name || '').toLowerCase()
    const parts = nameLower.split(/\s+/).filter((s) => s.length > 1)
    if (!parts.length) return { id: c.id, score: 0 }
    const exactHits = parts.filter((part) => lower.indexOf(part) >= 0).length
    const fuzzySum = parts.reduce((sum, part) => sum + bestWordSimilarity(part, words), 0)
    const score = exactHits === parts.length ? 1 : fuzzySum / parts.length
    return { id: c.id, score }
  }).sort((a, b) => b.score - a.score)

  const top = scored[0]
  const CONFIDENT = 0.72
  if (!top || top.score < CONFIDENT) return null
  return top.id
}

// Auto-logs a Flock CRM interaction when a 1-on-1 meeting ends. Resolves the
// target contact as: explicit meetings.flock_contact_id -> the other
// meeting_attendance participant's user_id matched against
// flock_contacts.linked_user_id -> fuzzy name-matching against the
// creator's own contact names. Idempotent (client + DB unique index).
// Fails silently — a Flock hiccup should never block ending the meeting.
export async function syncFlockInteractionForMeeting(meeting, currentUserId) {
  try {
    if (meeting.meeting_type !== '1_on_1_meeting') return { skipped: 'not_1on1' }
    // flock_contacts/flock_interactions RLS is pastor_id = auth.uid() only —
    // a non-creator editor's own Flock RLS genuinely cannot write into the
    // creator's contact list, so skip rather than attempt a write RLS would
    // reject anyway (narrow edge case: 1-on-1s default private, so a
    // non-creator editor ending one is uncommon).
    if (meeting.created_by !== currentUserId) return { skipped: 'not_creator' }

    const { data: existing } = await supabase
      .from('flock_interactions')
      .select('id')
      .eq('meeting_id', meeting.id)
      .maybeSingle()
    if (existing) return { skipped: 'already_logged' }

    let contactId = meeting.flock_contact_id || null

    if (!contactId) {
      const { data: attendance } = await supabase
        .from('meeting_attendance')
        .select('user_id, attendee:users(id, name)')
        .eq('meeting_id', meeting.id)
      const other = (attendance ?? []).find((a) => a.user_id !== currentUserId)
      if (!other) return { skipped: 'no_other_attendee' }

      const { data: contacts } = await supabase
        .from('flock_contacts')
        .select('id, full_name, linked_user_id')
        .eq('pastor_id', currentUserId)
        .eq('active', true)

      const byLink = (contacts ?? []).find((c) => c.linked_user_id === other.user_id)
      contactId = byLink?.id
        || (other.attendee?.name
          ? matchPersonByName(other.attendee.name, (contacts ?? []).map((c) => ({ id: c.id, name: c.full_name })))
          : null)
    }
    if (!contactId) return { skipped: 'no_match' }

    const summary = (meeting.minutes || meeting.meeting_notes || meeting.summary || '').slice(0, 2000)
    const result = await callFlockCRM('saveInteraction', {
      payload: JSON.stringify({
        personId: contactId,
        result: 'Reached',
        summary,
        nextAction: 'None',
        meetingId: meeting.id,
        interactedAt: meeting.date || new Date().toISOString(),
      }),
    })

    return { linked: contactId, interactionId: result?.interactionId }
  } catch (err) {
    console.warn('[flockLink] non-fatal:', err.message)
    return { error: err.message }
  }
}
