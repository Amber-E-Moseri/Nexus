import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Mail, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useBulkAddTag, useBulkRemoveTag, useBulkUpdateParticipants, useBulkFlightNotRequired } from '../hooks/useICPLCBulk.js'
import { downloadCsv, participantsToCsv } from '../lib/exportParticipants.js'
import { FLIGHT_NOT_REQUIRED_REASONS, hasFlightData } from '../lib/flightRequirement.js'

const STATUSES = [
  { value: 'tracking', label: 'Tracking' },
  { value: 'likely', label: 'Likely' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'not_attending', label: 'Not attending' },
]

// Documentation fields that can be set in bulk. Values match the database check constraints.
const DOC_FIELDS = [
  { field: 'passport_readiness', label: 'Passport', options: [
    ['ready', 'Ready'], ['renewal_needed', 'Renewal needed'], ['renewal_in_progress', 'Renewal in progress'],
    ['no_passport', 'No passport'], ['unsure', 'Unsure'], ['issue', 'Issue'], ['unknown', 'Not provided'],
  ] },
  { field: 'visa_requirement', label: 'Visa requirement', options: [
    ['required', 'Required'], ['not_required', 'Not required'], ['review', 'Needs review'],
  ] },
  { field: 'visa_process_status', label: 'Visa process', options: [
    ['not_started', 'Not started'], ['in_progress', 'In progress'], ['submitted', 'Submitted'], ['processing', 'Processing'],
    ['approved', 'Approved'], ['issue', 'Issue'], ['not_applicable', 'Not applicable'],
  ] },
]

const selectStyle = { minHeight: 34, width: 'auto', maxWidth: 170 }

/**
 * Sticky bar shown while people are selected on the Working List. Every change asks for an inline
 * confirmation that names the count, since one click touches many records.
 */
export default function BulkActionBar({ eventId, selectedIds, selectedParticipants, userId, canWrite, canEmail, onEmail, onClear }) {
  const count = selectedIds.length
  const [pending, setPending] = useState(null) // { text, run }
  const [note, setNote] = useState(null) // { ok, text }
  const updateMut = useBulkUpdateParticipants()
  const addTagMut = useBulkAddTag()
  const removeTagMut = useBulkRemoveTag()
  const fnrMut = useBulkFlightNotRequired()
  const busy = updateMut.isPending || addTagMut.isPending || removeTagMut.isPending || fnrMut.isPending

  const { data: tags = [] } = useQuery({
    queryKey: ['icplc_tags', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_tags')
        .select('*')
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order('sort_order')
      if (error) throw error
      return data || []
    },
    enabled: !!eventId && canWrite,
    staleTime: 5 * 60_000,
  })

  const who = `${count} ${count === 1 ? 'person' : 'people'}`

  function ask(text, run) { setNote(null); setPending({ text, run }) }

  async function confirm() {
    const { run, text } = pending
    setPending(null)
    try {
      await run()
      setNote({ ok: true, text: `Done: ${text}` })
    } catch (err) {
      setNote({ ok: false, text: `Failed: ${err.message || 'could not save'}` })
    }
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      style={{
        position: 'sticky', bottom: 12, zIndex: 15, marginTop: 12,
        background: 'var(--icplc-surface, #fff)', border: '1px solid var(--icplc-purple, #4C2A92)',
        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: '10px 12px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      }}
    >
      <strong style={{ fontSize: 13, color: 'var(--icplc-purple, #4C2A92)' }}>{count} selected</strong>

      {pending ? (
        <>
          <span style={{ fontSize: 13 }}>{pending.text}</span>
          <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy} onClick={confirm}>Apply</button>
          <button type="button" className="icplc-btn" onClick={() => setPending(null)}>Cancel</button>
        </>
      ) : (
        <>
          {canWrite && (
            <>
              <select
                className="icplc-input"
                style={selectStyle}
                aria-label="Set participation status for selected"
                value=""
                disabled={busy}
                onChange={(e) => {
                  const s = STATUSES.find((x) => x.value === e.target.value)
                  if (!s) return
                  if (s.value === 'confirmed') {
                    // Skip not_attending participants — they must be re-activated individually first
                    const eligible = selectedIds.filter(
                      (id) => selectedParticipants.find((p) => p.id === id)?.participation_status !== 'not_attending'
                    )
                    const skippedCount = selectedIds.length - eligible.length
                    const skipNote = skippedCount > 0 ? ` (${skippedCount} Not Attending skipped)` : ''
                    if (eligible.length === 0) {
                      setNote({ ok: false, text: 'All selected are Not Attending — re-activate them individually first.' })
                      return
                    }
                    ask(
                      `Confirm ${eligible.length} participant${eligible.length !== 1 ? 's' : ''}?${skipNote}`,
                      async () => {
                        await updateMut.mutateAsync({ ids: eligible, fields: { participation_status: 'confirmed' }, userId })
                        if (skippedCount > 0) setNote({ ok: true, text: `Confirmed ${eligible.length}; ${skippedCount} Not Attending skipped.` })
                      },
                    )
                  } else {
                    ask(`Set status to "${s.label}" for ${who}?`, () => updateMut.mutateAsync({ ids: selectedIds, fields: { participation_status: s.value }, userId }))
                  }
                }}
              >
                <option value="">Set status…</option>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              {DOC_FIELDS.map(({ field, label, options }) => (
                <select
                  key={field}
                  className="icplc-input"
                  style={selectStyle}
                  aria-label={`Set ${label.toLowerCase()} for selected`}
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const opt = options.find(([v]) => v === e.target.value)
                    if (opt) ask(`Set ${label.toLowerCase()} to "${opt[1]}" for ${who}?`, () => updateMut.mutateAsync({ ids: selectedIds, fields: { [field]: opt[0] }, userId }))
                  }}
                >
                  <option value="">{label}…</option>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}

              <select
                className="icplc-input"
                style={selectStyle}
                aria-label="Add a tag to selected"
                value=""
                disabled={busy || tags.length === 0}
                onChange={(e) => {
                  const t = tags.find((x) => x.id === e.target.value)
                  if (t) ask(`Add tag "${t.name}" to ${who}?`, () => addTagMut.mutateAsync({ ids: selectedIds, tagId: t.id, addedBy: userId }))
                }}
              >
                <option value="">Add tag…</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <select
                className="icplc-input"
                style={selectStyle}
                aria-label="Remove a tag from selected"
                value=""
                disabled={busy || tags.length === 0}
                onChange={(e) => {
                  const t = tags.find((x) => x.id === e.target.value)
                  if (t) ask(`Remove tag "${t.name}" from ${who}?`, () => removeTagMut.mutateAsync({ ids: selectedIds, tagId: t.id }))
                }}
              >
                <option value="">Remove tag…</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              {/* Mark FNR in bulk — skips participants with existing flight/travel data or Not Attending status */}
              <select
                className="icplc-input"
                style={selectStyle}
                aria-label="Mark flight not required for selected"
                value=""
                disabled={busy}
                onChange={(e) => {
                  const reason = e.target.value
                  if (!reason) return
                  // Build eligible set using the same canonical predicate as the server re-check
                  const eligible = selectedParticipants.filter(
                    (pt) => selectedIds.includes(pt.id) && !hasFlightData(pt) && pt.participation_status !== 'not_attending'
                  )
                  const skippedFlight = selectedParticipants.filter(
                    (pt) => selectedIds.includes(pt.id) && hasFlightData(pt)
                  ).length
                  const skippedNotAttending = selectedParticipants.filter(
                    (pt) => selectedIds.includes(pt.id) && !hasFlightData(pt) && pt.participation_status === 'not_attending'
                  ).length
                  if (eligible.length === 0) {
                    const reasons = []
                    if (skippedFlight > 0) reasons.push('have existing flight/travel data')
                    if (skippedNotAttending > 0) reasons.push('are Not Attending')
                    setNote({ ok: false, text: `No eligible participants — all selected ${reasons.join(' or ')}.` })
                    return
                  }
                  const skipParts = []
                  if (skippedFlight > 0) skipParts.push(`${skippedFlight} with existing flight data`)
                  if (skippedNotAttending > 0) skipParts.push(`${skippedNotAttending} Not Attending`)
                  const conflictNote = skipParts.length > 0 ? ` (${skipParts.join(', ')} skipped)` : ''
                  ask(
                    `Mark flight not required for ${eligible.length} participant${eligible.length !== 1 ? 's' : ''}?${conflictNote}`,
                    async () => {
                      const result = await fnrMut.mutateAsync({ ids: eligible.map((pt) => pt.id), reason, userId })
                      if (result.skipped > 0) {
                        const noteParts = []
                        if (result.skippedFlight > 0) noteParts.push(`${result.skippedFlight} with flight data`)
                        if (result.skippedNotAttending > 0) noteParts.push(`${result.skippedNotAttending} Not Attending`)
                        setNote({ ok: true, text: `FNR set for ${result.applied}; ${noteParts.join(', ')} skipped by server re-check.` })
                      }
                    },
                  )
                }}
              >
                <option value="">Mark FNR…</option>
                {FLIGHT_NOT_REQUIRED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </>
          )}

          <button
            type="button"
            className="icplc-btn"
            onClick={() => {
              downloadCsv(`icplc-people-${new Date().toISOString().slice(0, 10)}.csv`, participantsToCsv(selectedParticipants))
              setNote({ ok: true, text: `Exported ${who}` })
            }}
          >
            <Download size={14} aria-hidden /> Export CSV
          </button>

          {canEmail && (
            <button type="button" className="icplc-btn" onClick={onEmail}>
              <Mail size={14} aria-hidden /> Email
            </button>
          )}
        </>
      )}

      {note && (
        <span role="status" style={{ fontSize: 12.5, color: note.ok ? 'var(--icplc-green)' : 'var(--icplc-red)' }}>{note.text}</span>
      )}

      <span style={{ flex: 1 }} />
      <button type="button" className="icplc-btn" onClick={onClear} aria-label="Clear selection">
        <X size={14} aria-hidden /> Clear
      </button>
    </div>
  )
}
