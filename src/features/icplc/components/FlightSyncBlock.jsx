import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import ParticipantPicker, { personOptionLabel } from './ParticipantPicker.jsx'

// Sync flight data from the CMP Flight Form (Leaders Platform) into Travel, same flow as
// Registration's Transportation tab: fetch preview, hand-match unrecognised names, apply.
// Rows locked in Travel (staff override) are skipped by the function.

const normalizeForCompare = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const FLIGHT_FIELDS = ['arrival_date', 'arrival_time', 'arrival_flight', 'departure_date', 'departure_time', 'departure_flight']

const FLIGHT_STATUS_LABELS = {
  matched_applied: 'Will update flights',
  matched_source_only: 'Already up to date',
  unmatched: 'No matching participant',
  ambiguous: 'Name matches several people',
  unknown_value: 'Unrecognised answer',
  superseded: 'Older submission',
  error: 'Error',
}

function flightLine(p, m, kind) {
  const pick = (f) => (m?.[`${kind}_${f}`] !== undefined ? m[`${kind}_${f}`] : p?.[`${kind}_${f}`])
  const parts = [pick('date'), pick('time'), pick('flight')].filter(Boolean)
  const changed = ['date', 'time', 'flight'].some((f) => m?.[`${kind}_${f}`] !== undefined && m[`${kind}_${f}`] !== p?.[`${kind}_${f}`])
  return { text: parts.length ? parts.join(' · ') : 'Not set', changed }
}

export default function FlightSyncBlock() {
  const { config } = useICPLC()
  const eventId = config?.id
  const qc = useQueryClient()
  const [phase, setPhase] = useState('idle') // idle | previewing | previewed | applying | applied
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  // Hand assignments by participant ID: { [submission_id]: participantId }. Names are display-only.
  const [assigned, setAssigned] = useState({})
  const [changing, setChanging] = useState({}) // submission ids whose match is being corrected

  const { data: people = [] } = useQuery({
    queryKey: ['icplc_flight_sync_people', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error: qError } = await supabase.from('icplc_participants').select('id, full_name, email, subgroup').eq('event_id', eventId).order('full_name')
      if (qError) throw qError
      return data || []
    },
  })

  function pickPerson(submissionId, participantId) {
    setAssigned((prev) => {
      const next = { ...prev }
      if (participantId) next[submissionId] = participantId
      else delete next[submissionId]
      return next
    })
  }

  async function run(action) {
    setError(null)
    setPhase(action === 'preview' ? 'previewing' : 'applying')
    try {
      const manual_matches = action === 'apply' ? Object.entries(assigned).map(([submission_id, participant_id]) => ({ submission_id, participant_id })) : []
      if (action === 'preview') { setAssigned({}); setChanging({}) }
      const { data, error: invokeError } = await supabase.functions.invoke('cmp-flight-sync', { body: { action, event_id: eventId, manual_matches } })
      if (invokeError) {
        let message = invokeError.message
        if (invokeError.name === 'FunctionsFetchError') message = 'Could not reach the cmp-flight-sync function. It may not be deployed to this project yet.'
        try { message = (await invokeError.context?.json?.())?.error || message } catch { /* keep default */ }
        throw new Error(message)
      }
      setResult({ ...data, action })
      setPhase(action === 'preview' ? 'previewed' : 'applied')
      if (action === 'apply') {
        qc.invalidateQueries({ queryKey: ['icplc_flight_preview_participants'] })
        qc.invalidateQueries({ queryKey: ['icplc_participants'] })
        qc.invalidateQueries({ queryKey: ['icplc_wl_registrations'] })
      }
    } catch (err) {
      setError(err.message || 'Flight sync failed.')
      setPhase(action === 'apply' ? 'previewed' : 'idle')
    }
  }

  const rows = (result?.results || []).filter((r) => r.participant_id && r.status !== 'superseded')
  const ids = rows.map((r) => r.participant_id)
  const { data: current = [] } = useQuery({
    queryKey: ['icplc_flight_preview_participants', eventId, ids.join(',')],
    enabled: !!eventId && ids.length > 0,
    queryFn: async () => {
      const { data, error: qError } = await supabase.from('icplc_participants').select(`id, full_name, ${FLIGHT_FIELDS.join(', ')}`).in('id', ids)
      if (qError) throw qError
      return data || []
    },
  })
  const byId = new Map(current.map((p) => [p.id, p]))

  const busy = phase === 'previewing' || phase === 'applying'
  const counts = result?.counts || {}
  const toUpdate = (counts.matched_applied || 0) + Object.keys(assigned).length
  const unresolved = (result?.results || []).filter((r) => r.status === 'unmatched' || r.status === 'ambiguous')
  const attention = (result?.results || []).filter((r) => ['unknown_value', 'error'].includes(r.status))
  const canChange = true
  const flightCell = (f, kind) => [f?.[`${kind}_date`], f?.[`${kind}_time`], f?.[`${kind}_flight`]].filter(Boolean).join(' · ') || '—'

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: '14px 18px', background: '#EFF6FF', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span className="icplc-maturity-tag icplc-maturity-tag--beta" style={{ marginTop: 2 }}>BETA</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E3A5F', marginBottom: 4 }}>CMP Flight Sync — Beta</div>
          <div style={{ fontSize: 12, color: '#2563EB', lineHeight: 1.55 }}>
            Pulls arrival and departure details from the Leaders Platform Flight Form into Travel. Preview writes nothing; Apply updates only after you confirm.
          </div>
        </div>
      </div>

      <section>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Like the Registration sync, people are matched by <strong>name</strong> (the first and last name typed on the form, honorifics ignored) because the form has no email field.
          A name that matches nobody, or two participants, is listed so you can pick the right person by hand; use "Wrong person? Merge into…" on any matched row to correct it. Your choice is saved, so the same name keeps going to that person on future syncs. If someone submits twice, the latest
          submission wins. Times are stored as 24-hour HH:MM. Staff-overridden fields and empty answers are left alone.
        </p>
      </section>

      <section>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', background: 'var(--surface-1)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="icplc-btn" disabled={busy || !eventId} onClick={() => run('preview')}>
              {phase === 'previewing' ? 'Fetching preview…' : result ? 'Refresh preview' : 'Preview flight sync'}
            </button>
            <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy || phase !== 'previewed' || toUpdate === 0} onClick={() => setConfirming(true)}>
              {phase === 'applying' ? 'Applying…' : 'Apply to participants'}
            </button>
          </div>

          {confirming && (
            <div role="alertdialog" aria-label="Confirm apply" style={{ marginTop: 12, border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Update flights for {toUpdate} participant{toUpdate === 1 ? '' : 's'}?</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Fields with a staff override are left alone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="icplc-btn icplc-btn-primary" onClick={() => { setConfirming(false); run('apply') }}>Yes, apply</button>
                <button type="button" className="icplc-btn" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{ marginTop: 12, fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px' }}>{error}</div>
          )}

          {phase === 'applied' && (
            <div role="status" style={{ marginTop: 12, fontSize: 13, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '8px 12px' }}>
              Applied. {counts.matched_applied || 0} participant{(counts.matched_applied || 0) === 1 ? '' : 's'} updated.{(counts.error || 0) > 0 ? ` ${counts.error} failed — see the list below.` : ''}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {result.action === 'apply' ? 'Applied' : 'Preview'} · {result.submission_count} submission{result.submission_count === 1 ? '' : 's'} fetched
                {result.submission_count === 0 ? ' — the form has no responses yet.' : ''}
              </div>
              {result.submission_count > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  {Object.entries(FLIGHT_STATUS_LABELS).filter(([k]) => (counts[k] || 0) > 0).map(([k, label]) => (
                    <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{counts[k]}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
              {rows.length > 0 && (
                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                  <table className="icplc-subgroup-table" style={{ fontSize: 12, width: '100%' }}>
                    <thead><tr><th>Name on form → participant</th><th>Arrival</th><th>Departure</th><th>Result</th></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const p = byId.get(r.participant_id)
                        const m = r.canonical_mutations || {}
                        return (
                          <tr key={r.submission_id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{p?.full_name || '…'}</div>
                              {r.submitter?.name && normalizeForCompare(r.submitter.name) !== normalizeForCompare(p?.full_name) && (
                                <div style={{ color: 'var(--text-secondary)' }}>form: {r.submitter.name}</div>
                              )}
                              {assigned[r.submission_id] && (
                                <div style={{ color: 'var(--icplc-green)' }}>
                                  → {personOptionLabel(people.find((x) => x.id === assigned[r.submission_id]) || {})} (applies on Apply)
                                </div>
                              )}
                              {canChange && (
                                changing[r.submission_id] ? (
                                  <ParticipantPicker
                                    people={people}
                                    value={assigned[r.submission_id]}
                                    sameNameAs={r.submitter?.name}
                                    ariaLabel={`Merge ${r.submitter?.name || 'submission'} into a different participant`}
                                    onChange={(id) => pickPerson(r.submission_id, id)}
                                    style={{ marginTop: 4 }}
                                  />
                                ) : (
                                  <button type="button" onClick={() => setChanging((prev) => ({ ...prev, [r.submission_id]: true }))}
                                    style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, color: 'var(--icplc-purple)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
                                    Wrong person? Merge into…
                                  </button>
                                )
                              )}
                            </td>
                            {['arrival', 'departure'].map((kind) => {
                              const line = flightLine(p, m, kind)
                              return <td key={kind} style={line.changed ? { color: 'var(--icplc-green)', fontWeight: 600 } : { color: 'var(--text-secondary)' }}>{line.text}</td>
                            })}
                            <td>{FLIGHT_STATUS_LABELS[r.status] || r.status}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {unresolved.length > 0 && (
                <div style={{ marginTop: 14, border: '1px solid #FCD34D', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: '#FFFBEB', fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>
                    ⚠ {unresolved.length} name{unresolved.length === 1 ? '' : 's'} could not be matched automatically — assign each one to apply their flights
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="icplc-subgroup-table" style={{ fontSize: 12, width: '100%' }}>
                      <thead><tr><th>Name on form</th><th>Arrival</th><th>Departure</th><th>Match to participant</th></tr></thead>
                      <tbody>
                        {unresolved.map((r) => (
                          <tr key={r.submission_id} style={assigned[r.submission_id] ? { background: '#F0FDF4' } : undefined}>
                            <td style={{ fontWeight: 600 }}>
                              {r.submitter?.name || 'Unnamed'}
                              {r.status === 'ambiguous' && <div style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>Several people share this name</div>}
                            </td>
                            <td>{flightCell(r.flight, 'arrival')}</td>
                            <td>{flightCell(r.flight, 'departure')}</td>
                            <td style={{ minWidth: 200 }}>
                              <ParticipantPicker
                                people={people}
                                value={assigned[r.submission_id]}
                                sameNameAs={r.submitter?.name}
                                ariaLabel={`Match ${r.submitter?.name || 'submission'} to a participant`}
                                onChange={(id) => pickPerson(r.submission_id, id)}
                                style={{ borderColor: assigned[r.submission_id] ? '#22C55E' : undefined }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {attention.length > 0 && (
                <details style={{ marginTop: 12 }} open>
                  <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{attention.length} submission{attention.length === 1 ? '' : 's'} need attention</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {attention.slice(0, 100).map((r) => (
                      <li key={r.submission_id}>
                        <strong>{r.submitter?.name || 'Unnamed'}</strong> — {FLIGHT_STATUS_LABELS[r.status] || r.status}{r.issues?.length ? ` (${r.issues.join('; ')})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
