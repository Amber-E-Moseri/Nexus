import React, { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useMergeParticipants } from '../hooks/useICPLCProfile.js'

// Mirrors the field list + "empty" rules in icplc_merge_participants (20270930000014).
const FIELDS = [
  ['full_name', 'Full name'],
  ['email', 'Email'],
  ['region', 'Campus / Region'],
  ['subgroup', 'Subgroup'],
  ['leadership', 'Leadership'],
  ['kingschat_username', 'KingsChat handle'],
  ['kingschat_user_id', 'KingsChat user ID'],
  ['gender', 'Gender'],
  ['notes', 'Notes'],
  ['participation_status', 'Participation'],
  ['registration_status', 'Registration status'],
  ['passport_country', 'Passport country'],
  ['passport_region', 'Passport region'],
  ['passport_readiness', 'Passport readiness'],
  ['canada_residency_status', 'Canadian status'],
  ['canada_status_document_readiness', 'Canadian document readiness'],
  ['visa_requirement', 'Visa requirement'],
  ['visa_process_status', 'Visa process'],
  ['arrival_date', 'Arrival date'],
  ['arrival_time', 'Arrival time'],
  ['arrival_flight', 'Arrival flight'],
  ['departure_date', 'Departure date'],
  ['departure_time', 'Departure time'],
  ['departure_flight', 'Departure flight'],
]
const DEFAULTS = {
  participation_status: 'tracking', registration_status: 'unknown', passport_readiness: 'unknown',
  visa_requirement: 'review', visa_process_status: 'not_started',
}

const clean = (field, v) => {
  const t = v == null ? '' : String(v).trim()
  return t === '' || DEFAULTS[field] === t ? '' : t
}
const pretty = (v) => (v ? String(v).replace(/_/g, ' ') : '—')
const tokens = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Compare two participants field by field. */
function compare(keep, other) {
  const conflicts = []
  const filled = []
  for (const [field, label] of FIELDS) {
    const a = clean(field, keep[field])
    const b = clean(field, other[field])
    if (!b) continue
    if (!a) filled.push(label)
    else if (field === 'email' ? a.toLowerCase() !== b.toLowerCase() : a !== b) {
      conflicts.push({ field, label, a, b }) // same test the database applies
    }
  }
  return { conflicts, filled }
}

export default function MergeParticipantDialog({ participant, onClose, onMerged }) {
  const merge = useMergeParticipants()
  const [search, setSearch] = useState('')
  const [other, setOther] = useState(null)
  const [choices, setChoices] = useState({}) // field -> 'keep' | 'remove'

  const { data: everyone = [], isLoading } = useQuery({
    queryKey: ['icplc_merge_candidates', participant.event_id],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_participants')
        .select('*')
        .eq('event_id', participant.event_id)
        .order('full_name')
      if (error) throw error
      return data || []
    },
  })

  const candidates = useMemo(() => {
    const want = new Set(tokens(participant.full_name))
    const q = search.trim().toLowerCase()
    return everyone
      .filter((p) => p.id !== participant.id)
      .filter((p) => !q || (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
      .map((p) => ({ p, score: tokens(p.full_name).filter((t) => want.has(t)).length }))
      .sort((x, y) => y.score - x.score || (x.p.full_name || '').localeCompare(y.p.full_name || ''))
  }, [everyone, participant, search])

  const diff = useMemo(() => (other ? compare(participant, other) : null), [participant, other])

  async function doMerge() {
    const picked = Object.fromEntries(Object.entries(choices).filter(([, v]) => v === 'remove'))
    await merge.mutateAsync({ keepId: participant.id, removeId: other.id, choices: picked })
    onMerged?.()
  }

  const overlay = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)' }
  const th = { textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 6px' }
  const td = { padding: '8px 6px', borderTop: '1px solid var(--border, #E5E7EB)', verticalAlign: 'top', fontSize: 13 }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !merge.isPending) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlay} />
        <Dialog.Content className="icplc-dialog" aria-describedby={undefined} style={{ width: 'min(680px, calc(100vw - 24px))' }}>
          <Dialog.Title style={{ margin: '0 0 4px', fontSize: 16 }}>Merge into {participant.full_name}</Dialog.Title>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {participant.full_name} is kept. Pick the duplicate to fold into them. The duplicate is removed afterwards, and its tags,
            registration links and import history move over.
          </p>

          {!other && (
            <>
              <input
                autoFocus
                type="search"
                className="icplc-input"
                placeholder="Search the duplicate by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Find duplicate participant"
              />
              <div style={{ marginTop: 10, maxHeight: '48vh', overflowY: 'auto', border: '1px solid var(--border, #E5E7EB)', borderRadius: 8 }}>
                {isLoading && <div style={{ padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</div>}
                {!isLoading && candidates.length === 0 && (
                  <div style={{ padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>No matching participants.</div>
                )}
                {candidates.map(({ p, score }, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setOther(p); setChoices({}) }}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderTop: i ? '1px solid var(--border, #E5E7EB)' : 'none', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
                  >
                    <span>{score > 0 ? '★ ' : ''}<strong>{p.full_name}</strong>{p.email ? <span style={{ color: 'var(--text-secondary)' }}> · {p.email}</span> : null}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{p.subgroup || ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {other && diff && (
            <>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Duplicate: <strong>{other.full_name}</strong>{other.email ? ` · ${other.email}` : ''}{' '}
                <button type="button" onClick={() => setOther(null)} disabled={merge.isPending}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>
                  Change
                </button>
              </div>

              {diff.conflicts.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {diff.conflicts.length} field{diff.conflicts.length === 1 ? '' : 's'} differ — choose which value to keep
                  </div>
                  <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr><th style={th}>Field</th><th style={th}>{participant.full_name} (kept)</th><th style={th}>{other.full_name} (duplicate)</th></tr>
                      </thead>
                      <tbody>
                        {diff.conflicts.map(({ field, label, a, b }) => {
                          const pick = choices[field] || 'keep'
                          const cell = (side, value) => (
                            <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer', overflowWrap: 'anywhere' }}>
                              <input type="radio" name={`merge-${field}`} checked={pick === side}
                                onChange={() => setChoices((c) => ({ ...c, [field]: side }))} style={{ marginTop: 3 }} />
                              <span style={{ fontWeight: pick === side ? 600 : 400 }}>{pretty(value)}</span>
                            </label>
                          )
                          return (
                            <tr key={field}>
                              <td style={{ ...td, color: 'var(--text-secondary)' }}>{label}</td>
                              <td style={td}>{cell('keep', a)}</td>
                              <td style={td}>{cell('remove', b)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {diff.conflicts.some((c) => c.field === 'email') && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      The email you don't pick is kept as the alternate email.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ margin: '0 0 8px', fontSize: 13 }}>No conflicting values — nothing to choose.</p>
              )}

              {diff.filled.length > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Empty on {participant.full_name}, will be filled from the duplicate: {diff.filled.join(', ')}.
                </p>
              )}

              {merge.isError && (
                <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#991B1B', background: '#FEF2F2', borderRadius: 6, padding: '6px 10px' }}>
                  Could not merge: {merge.error?.message}
                </div>
              )}
            </>
          )}

          <div className="icplc-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="icplc-btn" onClick={onClose} disabled={merge.isPending}>Cancel</button>
            {other && (
              <button type="button" className="icplc-btn icplc-btn-primary" onClick={doMerge} disabled={merge.isPending}
                style={{ background: '#B42318' }}>
                {merge.isPending ? 'Merging…' : `Merge and remove ${other.full_name}`}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
