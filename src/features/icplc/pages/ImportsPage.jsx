import React, { useRef, useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLCImport, IMPORT_STEPS, isMatchedRow } from '../hooks/useICPLCImport.js'
import { RESIDENCY_STATUS_LABELS } from '../../registration/icplcDocReadiness.js'

// Minimal RFC4180-style CSV parser (quoted fields, CRLF).
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f.trim())) rows.push(row)
  return rows
}

// Working List import handler
function WorkingListPanel({ fileRef, config, onReset }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleUpload = async (file) => {
    setError(null)
    setLoading(true)
    try {
      const text = await file.text()
      const table = parseCsv(text)
      if (table.length < 2) throw new Error('CSV must have at least a header row')

      const headers = table[0].map(h => h.trim())
      const headerMap = Object.fromEntries(headers.map((h, i) => [h, i]))
      if (!('fullName' in headerMap)) throw new Error('Missing required column: fullName')

      const { supabase } = await import('../../../lib/supabase')
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const cell = (fields, col) => (col in headerMap ? fields[headerMap[col]]?.trim() : '') || ''

      // Email is optional: rows without one are matched/deduped by name.
      const rows = []
      let skipped = 0
      for (const fields of table.slice(1)) {
        const fullName = cell(fields, 'fullName')
        if (!fullName) { skipped++; continue }
        rows.push({
          full_name: fullName,
          email: cell(fields, 'email').toLowerCase() || null,
          kingschat_username: cell(fields, 'kingsChatHandle').replace(/^@/, '') || null,
        })
      }
      if (rows.length === 0) throw new Error('CSV has no valid rows (fullName is required)')

      // Re-uploads: update people who already exist (by email, else name), insert the rest.
      const { data: existing, error: exErr } = await supabase
        .from('icplc_participants')
        .select('id, email, full_name')
        .eq('event_id', config?.id)
      if (exErr) throw exErr
      const byEmail = new Map(existing.filter(p => p.email).map(p => [p.email.toLowerCase().trim(), p.id]))
      const byName = new Map(existing.map(p => [norm(p.full_name), p.id]))

      const toInsert = []
      const toUpdate = []
      const seen = new Set()
      for (const r of rows) {
        const key = r.email || norm(r.full_name)
        if (seen.has(key)) { skipped++; continue }
        seen.add(key)
        const id = (r.email && byEmail.get(r.email)) || byName.get(norm(r.full_name))
        if (id) toUpdate.push({ id, r })
        else toInsert.push({
          event_id: config?.id,
          ...r,
          registration_status: 'unknown',
          participation_status: 'tracking',
        })
      }

      if (toInsert.length) {
        const { error: insErr } = await supabase.from('icplc_participants').insert(toInsert)
        if (insErr) throw insErr
      }
      for (const { id, r } of toUpdate) {
        const patch = {}
        if (r.kingschat_username) patch.kingschat_username = r.kingschat_username
        if (r.email) patch.email = r.email
        if (!Object.keys(patch).length) continue
        const { error: upErr } = await supabase.from('icplc_participants').update(patch).eq('id', id)
        if (upErr) throw upErr
      }

      const data = { length: toInsert.length + toUpdate.length }
      setResult({ imported: data.length, added: toInsert.length, updated: toUpdate.length, skipped })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h3 style={{ margin: '0 0 12px', color: '#166534' }}>Import complete</h3>
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          Processed <strong>{result.imported}</strong> participants: {result.added} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped (blank or duplicate)` : ''}.
        </div>
        <button onClick={() => { setResult(null); onReset?.() }} style={{ ...primaryBtn, display: 'inline-block' }}>
          Import another file
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ margin: '0 0 12px' }}>Upload Working List CSV</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Import a simple working list with columns: <code>email</code>, <code>fullName</code>, <code>phone</code> (optional), <code>kingsChatHandle</code> (optional).
      </p>
      {error && (
        <div style={{ padding: 12, background: '#FEF2F2', borderRadius: 6, color: '#991B1B', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
        style={{ display: 'none' }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file"
        onClick={() => !loading && fileRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !loading && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file && !loading) handleUpload(file)
        }}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 10,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          background: 'var(--surface-2)',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>📂</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {loading ? 'Importing…' : 'Drag & drop a CSV file here'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          or click to browse your files
        </div>
        {!loading && (
          <span style={{ ...primaryBtn, display: 'inline-block', pointerEvents: 'none' }}>
            Choose CSV file
          </span>
        )}
      </div>
    </div>
  )
}

// CMP fields that can be updated by the sync (allowlisted mutations)
const CMP_UPDATABLE_FIELDS = [
  { field: 'passport_readiness',     label: 'Passport Readiness',       protection: 'Override-protected' },
  { field: 'canada_residency_status',label: 'Canadian Residency Status', protection: 'Override-protected' },
  { field: 'source_values',          label: 'Source Values (raw)',       protection: 'Always updated' },
]

const CMP_PROTECTED_FIELDS = [
  'email', 'full_name', 'participation_status', 'registration_status',
  'passport_country (unless explicitly canonical)', 'all unrelated documentation fields',
]

const CMP_STATUS_LABELS = {
  matched_applied: 'Will update fields',
  matched_source_only: 'Source data only',
  unmatched: 'No matching participant',
  unknown_value: 'Unrecognised answer',
  identity_conflict: 'Identity conflict',
  error: 'Error',
}

const humanizeValue = (v) => {
  const t = String(v ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Not set'
}

// "Ready → Ready" is shown as unchanged; an override-protected field is never changed by CMP.
function cmpChange(current, next, overridden, label) {
  if (overridden) return <span style={{ color: 'var(--text-secondary)' }}>{label(current)} · staff override kept</span>
  if (next === undefined) return <span style={{ color: 'var(--text-secondary)' }}>{label(current)} · no change</span>
  if (next === current) return <span style={{ color: 'var(--text-secondary)' }}>{label(current)} · already up to date</span>
  return (
    <span>
      <span style={{ color: 'var(--text-secondary)' }}>{label(current)}</span>
      {' → '}
      <strong style={{ color: 'var(--icplc-green)' }}>{label(next)}</strong>
    </span>
  )
}

function CMPSyncAction() {
  const { config } = useICPLC()
  const [phase, setPhase] = useState('idle') // idle | previewing | previewed | applying | applied
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const eventId = config?.id
  const qc = useQueryClient()

  const [addedNote, setAddedNote] = useState(null)

  async function run(action, extra = {}) {
    setError(null)
    setPhase(action === 'preview' ? 'previewing' : 'applying')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('cmp-documentation-sync', {
        body: { action, event_id: eventId, ...extra },
      })
      if (invokeError) {
        // FunctionsHttpError carries the response; surface the function's own message.
        let message = invokeError.message
        if (invokeError.name === 'FunctionsFetchError') {
          // No HTTP response at all: the function isn't deployed to this project, or the request was blocked.
          message = 'Could not reach the cmp-documentation-sync function. It may not be deployed to this project yet.'
        }
        try { message = (await invokeError.context?.json?.())?.error || message } catch { /* keep default */ }
        throw new Error(message)
      }
      if (action === 'add_unmatched') {
        const added = (data.results || []).filter((r) => r.participant_id).length
        const failed = (data.results || []).length - added
        setAddedNote(`Added ${added} to People as not registered${failed ? `; ${failed} could not be added` : ''}.`)
        qc.invalidateQueries({ queryKey: ['icplc_participants'] })
        qc.invalidateQueries({ queryKey: ['icplc_wl_registrations'] })
        await run('preview')
        return
      }
      setAddedNote(null)
      setResult({ ...data, action })
      setPhase(action === 'preview' ? 'previewed' : 'applied')
      if (action === 'apply') {
        // Refresh everything that shows participant data so the change is visible right away.
        qc.invalidateQueries({ queryKey: ['icplc_cmp_preview_participants'] })
        qc.invalidateQueries({ queryKey: ['icplc_participants'] })
        qc.invalidateQueries({ queryKey: ['icplc_profile'] })
        qc.invalidateQueries({ queryKey: ['icplc_wl_registrations'] })
      }
    } catch (err) {
      setError(err.message || 'CMP sync failed.')
      setPhase(action === 'apply' ? 'previewed' : 'idle')
    }
  }

  // Inline confirmation: native window.confirm is suppressed in some embedded browsers,
  // which made Apply silently do nothing.
  const [confirming, setConfirming] = useState(false)

  function apply() {
    setConfirming(false)
    run('apply')
  }

  const previewRows = (result?.results || []).filter((r) => r.participant_id)
  const participantIds = previewRows.map((r) => r.participant_id)
  const { data: currentParticipants = [] } = useQuery({
    queryKey: ['icplc_cmp_preview_participants', eventId, participantIds.join(',')],
    enabled: !!eventId && participantIds.length > 0,
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from('icplc_participants')
        .select('id, full_name, email, passport_readiness, canada_residency_status, override_fields')
        .in('id', participantIds)
      if (qError) throw qError
      return data || []
    },
  })
  const participantById = new Map(currentParticipants.map((p) => [p.id, p]))

  const busy = phase === 'previewing' || phase === 'applying'
  const counts = result?.counts || {}
  const matched = (counts.matched_applied || 0) + (counts.matched_source_only || 0)
  const notable = (result?.results || []).filter((r) => r.status !== 'matched_applied' && r.status !== 'matched_source_only' && r.status !== 'unmatched')
  const unmatchedRows = (result?.results || []).filter((r) => r.status === 'unmatched')

  return (
    <section>
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Sync Action</h3>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', background: 'var(--surface-1)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="icplc-btn" disabled={busy || !eventId} onClick={() => run('preview')}>
            {phase === 'previewing' ? 'Fetching preview…' : result ? 'Refresh preview' : 'Preview CMP sync'}
          </button>
          <button
            type="button"
            className="icplc-btn icplc-btn-primary"
            disabled={busy || phase !== 'previewed' || matched === 0}
            onClick={() => setConfirming(true)}
          >
            {phase === 'applying' ? 'Applying…' : 'Apply to participants'}
          </button>
        </div>

        {confirming && (
          <div role="alertdialog" aria-label="Confirm apply" style={{ marginTop: 12, border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Apply CMP documentation to {matched} matched participant{matched === 1 ? '' : 's'}?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              This updates their records. Fields with a staff override are left alone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="icplc-btn icplc-btn-primary" onClick={apply}>Yes, apply</button>
              <button type="button" className="icplc-btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: 12, fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        {phase === 'applied' && (
          <div role="status" style={{ marginTop: 12, fontSize: 13, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '8px 12px' }}>
            Applied. {counts.matched_applied || 0} participant{(counts.matched_applied || 0) === 1 ? '' : 's'} updated
            {counts.matched_source_only ? `, ${counts.matched_source_only} source-data only` : ''}.
            {(counts.error || 0) > 0 ? ` ${counts.error} failed — see the list below.` : ''}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {result.action === 'apply' ? 'Applied' : 'Preview'} · {result.submission_count} submission{result.submission_count === 1 ? '' : 's'} fetched
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              {Object.entries(CMP_STATUS_LABELS).filter(([k]) => counts[k] != null || k === 'identity_conflict').map(([k, label]) => (
                <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{counts[k] ?? (result.results || []).filter((r) => r.status === k).length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
                </div>
              ))}
            </div>
            {previewRows.length > 0 && (
              <div style={{ marginTop: 14, overflowX: 'auto' }}>
                <table className="icplc-subgroup-table" style={{ fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Passport</th>
                      <th>Canadian status</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => {
                      const p = participantById.get(r.participant_id)
                      const m = r.canonical_mutations || {}
                      return (
                        <tr key={r.submission_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p?.full_name || '…'}</div>
                            {p?.email && <div style={{ color: 'var(--text-secondary)' }}>{p.email}</div>}
                          </td>
                          <td>{cmpChange(p?.passport_readiness, m.passport_readiness, p?.override_fields?.passport_readiness?.overridden, humanizeValue)}</td>
                          <td>{cmpChange(p?.canada_residency_status, m.canada_residency_status, p?.override_fields?.canada_residency_status?.overridden, (v) => RESIDENCY_STATUS_LABELS[v] || humanizeValue(v))}</td>
                          <td>{CMP_STATUS_LABELS[r.status] || r.status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {addedNote && (
              <div role="status" style={{ marginTop: 12, fontSize: 13, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '8px 12px' }}>
                {addedNote}
              </div>
            )}
            {unmatchedRows.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {unmatchedRows.length} submission{unmatchedRows.length === 1 ? '' : 's'} not in People
                  </div>
                  <button type="button" className="icplc-btn" disabled={busy}
                    onClick={() => run('add_unmatched', { submission_ids: unmatchedRows.map((r) => r.submission_id) })}>
                    Add all to People
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  They are added as <strong>not registered</strong>; their documentation is attached. Registration and participation stay unchanged until staff or the Registration import set them.
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unmatchedRows.slice(0, 100).map((r) => (
                    <li key={r.submission_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
                      <span>
                        <strong>{r.submitter?.name || 'No name'}</strong>
                        {r.submitter?.email && <span style={{ color: 'var(--text-secondary)' }}> · {r.submitter.email}</span>}
                      </span>
                      <button type="button" className="icplc-btn" disabled={busy || !r.submitter?.name}
                        onClick={() => run('add_unmatched', { submission_ids: [r.submission_id] })}>
                        Add to People
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notable.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{notable.length} submission{notable.length === 1 ? '' : 's'} need attention</summary>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {notable.slice(0, 50).map((r) => (
                    <li key={r.submission_id}>
                      {CMP_STATUS_LABELS[r.status] || r.status}{r.issues?.length ? ` — ${r.issues.join('; ')}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
          Matching is by durable submission ID or exact email. Unmatched submissions are never added automatically — staff can add them to People as not registered.
        </div>
      </div>
    </section>
  )
}

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

function CMPFlightSyncPanel() {
  const { config } = useICPLC()
  const eventId = config?.id
  const qc = useQueryClient()
  const [phase, setPhase] = useState('idle') // idle | previewing | previewed | applying | applied
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)

  async function run(action) {
    setError(null)
    setPhase(action === 'preview' ? 'previewing' : 'applying')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('cmp-flight-sync', { body: { action, event_id: eventId } })
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
  const toUpdate = counts.matched_applied || 0
  const attention = (result?.results || []).filter((r) => ['unmatched', 'ambiguous', 'unknown_value', 'error'].includes(r.status))

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
          The flight form has no email field, so people are matched by <strong>exact full name</strong> (first + last).
          A name shared by two participants, or one that matches nobody, is listed for staff and never written. If someone
          submits twice, the latest submission wins. Staff-overridden fields and empty answers are left alone.
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
              Applied. {toUpdate} participant{toUpdate === 1 ? '' : 's'} updated.{(counts.error || 0) > 0 ? ` ${counts.error} failed — see the list below.` : ''}
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
                    <thead><tr><th>Participant</th><th>Arrival</th><th>Departure</th><th>Result</th></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const p = byId.get(r.participant_id)
                        const m = r.canonical_mutations || {}
                        return (
                          <tr key={r.submission_id}>
                            <td style={{ fontWeight: 600 }}>{p?.full_name || '…'}</td>
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

function CMPSyncPanel() {
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* BETA header */}
      <div style={{
        border: '1px solid #BFDBFE', borderRadius: 8, padding: '14px 18px',
        background: '#EFF6FF', display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span className="icplc-maturity-tag icplc-maturity-tag--beta" style={{ marginTop: 2 }}>BETA</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E3A5F', marginBottom: 4 }}>
            CMP Documentation Sync — Beta
          </div>
          <div style={{ fontSize: 12, color: '#2563EB', lineHeight: 1.55 }}>
            Preview reads the Leaders Platform form and shows what would change — nothing is written.
            Apply updates participants only after you have reviewed a preview and confirmed.
          </div>
        </div>
      </div>

      {/* What CMP sync does */}
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>What CMP Sync Does</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Pulls documentation submissions from the Leaders Platform immigration/documentation form and updates
          canonical fields on matching participants. Matching is by exact email — unmatched submissions never
          create new participants. Staff overrides prevent subsequent source refreshes from replacing staff decisions.
        </p>
      </section>

      {/* Updatable fields */}
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Fields CMP Can Update</h3>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {CMP_UPDATABLE_FIELDS.map((f, i) => (
            <div
              key={f.field}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
                padding: '10px 14px', fontSize: 12,
                borderBottom: i < CMP_UPDATABLE_FIELDS.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'var(--surface-1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace', fontSize: 11 }}>{f.field}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', alignSelf: 'center' }}>{f.protection}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Protected fields */}
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Fields CMP Cannot Modify</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {CMP_PROTECTED_FIELDS.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </section>

      <CMPSyncAction />
    </div>
  )
}

export default function ImportsPage() {
  const { config } = useICPLC()
  const fileRef = useRef(null)
  const [source, setSource] = useState('csv')
  const {
    step, parseResult, rows, applyResult, error, loading,
    uploadCSV, runMatch, runPreview, applyImport, resolveRow, reset,
  } = useICPLCImport(config?.id)

  const stepIndex = IMPORT_STEPS.indexOf(step)

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Source selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { key: 'working-list', label: 'Working List CSV' },
          { key: 'csv', label: 'Registration CSV' },
          { key: 'cmp', label: 'CMP Documentation Sync', maturity: 'beta' },
          { key: 'cmp-flights', label: 'CMP Flight Sync', maturity: 'beta' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className="icplc-btn"
            aria-pressed={source === s.key}
            style={{
              borderColor: source === s.key ? 'var(--icplc-purple)' : undefined,
              color: source === s.key ? 'var(--icplc-purple)' : undefined,
              fontWeight: source === s.key ? 600 : undefined,
              gap: 6,
            }}
          >
            {s.label}
            {s.maturity === 'beta' && (
              <span className="icplc-maturity-tag icplc-maturity-tag--beta">BETA</span>
            )}
          </button>
        ))}
      </div>

      {source === 'working-list' && <WorkingListPanel fileRef={fileRef} config={config} onReset={() => {}} />}

      {source === 'cmp' && <CMPSyncPanel />}

      {source === 'cmp-flights' && <CMPFlightSyncPanel />}

      {source === 'csv' && (<>
      {/* Step indicator */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 0', marginBottom: 24 }} aria-label="Import progress">
        {IMPORT_STEPS.filter((s) => s !== 'done').map((s, i) => {
          const idx = IMPORT_STEPS.indexOf(s)
          const done = stepIndex > idx
          const active = stepIndex === idx
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                background: done ? '#22C55E' : active ? 'var(--accent)' : 'var(--surface-2)',
                color: done || active ? 'white' : 'var(--text-secondary)',
                border: `2px solid ${done ? '#22C55E' : active ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ marginLeft: 6, fontSize: 12, color: active ? 'var(--accent)' : 'var(--text-secondary)', marginRight: 12 }} aria-current={active ? 'step' : undefined}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 3 && <div aria-hidden style={{ width: 16, height: 1, background: 'var(--border)', marginRight: 12 }} />}
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#FEF2F2', borderRadius: 6, color: '#991B1B', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Upload CSV</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Select a CSV file to import participants. Participation status is never imported from CSV.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files[0] && uploadCSV(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload CSV file"
            onClick={() => !loading && fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !loading && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file && !loading) uploadCSV(file)
            }}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 10,
              padding: '40px 24px',
              textAlign: 'center',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              background: 'var(--surface-2)',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              {loading ? 'Uploading…' : 'Drag & drop a CSV file here'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              or click to browse your files
            </div>
            {!loading && (
              <span style={{ ...primaryBtn, display: 'inline-block', pointerEvents: 'none' }}>
                Choose CSV file
              </span>
            )}
          </div>
        </div>
      )}

      {/* Step: Match */}
      {step === 'match' && parseResult && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Review & Match</h3>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {parseResult.rows.length} rows parsed. Unmapped columns: {parseResult.unmapped?.join(', ') || 'none'}.
            {parseResult.participationHeaders?.length > 0 && (
              <span> Participation column found — stored as reference metadata only.</span>
            )}
          </div>
          <button onClick={runMatch} disabled={loading} style={primaryBtn}>
            {loading ? 'Matching…' : 'Run matching'}
          </button>
        </div>
      )}

      {/* Step: Preview — display server-computed changes */}
      {step === 'preview' && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Review Changes</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Showing server-computed import decisions. Protected fields (staff overrides) will not be updated.
          </p>

          {/* Match summary */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Stat label="Total" value={rows.length} />
            <Stat label="Matched" value={rows.filter(isMatchedRow).length} tone="success" />
            <Stat label="Unmatched" value={rows.filter((r) => r.match_status === 'unmatched' && r.apply_status !== 'skipped').length} tone="warn" />
            <Stat label="Skipped" value={rows.filter((r) => r.apply_status === 'skipped').length} />
          </div>

          <UnmatchedResolver rows={rows} eventId={config?.id} onResolve={resolveRow} disabled={loading} />

          {/* Rows already linked, so it is clear what will be updated */}
          <MatchedRows rows={rows} eventId={config?.id} />

          <button onClick={runPreview} disabled={loading} style={primaryBtn}>
            {loading ? 'Computing preview…' : 'Compute field-level preview'}
          </button>
        </div>
      )}

      {/* Step: Confirm — show preview; Apply is disabled pending DB certification */}
      {step === 'confirm' && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Confirm Import</h3>
          <ChangesSummary rows={rows} />
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={applyImport}
              disabled={loading}
              style={primaryBtn}
            >
              {loading ? 'Applying…' : 'Apply import'}
            </button>
            <button onClick={reset} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && applyResult && (
        <div>
          <h3 style={{ margin: '0 0 12px', color: '#166534' }}>Import complete</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Stat label="Applied" value={applyResult.applied} tone="success" />
            <Stat label="Protected" value={applyResult.protected} />
            <Stat label="Errors" value={applyResult.errors} tone={applyResult.errors ? 'danger' : null} />
          </div>
          {rows.filter((r) => r.apply_status === 'error').map((r) => (
            <div key={r.id} style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>
              {rowInfo(r).name}: {r.error_detail || 'failed'}
            </div>
          ))}
          <button onClick={reset} style={ghostBtn}>Start another import</button>
        </div>
      )}
      </>)}
    </div>
  )
}

const MATCH_LABELS = {
  auto: 'email / name',
  manual: 'manual',
  persistent: 'previous import',
  auto_kingschat: 'KingsChat handle',
  auto_fuzzy_email: 'similar email',
  auto_fuzzy_name: 'similar name',
}

function useEventParticipants(eventId) {
  return useQuery({
    queryKey: ['icplc_import_participant_options', eventId],
    enabled: !!eventId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_participants')
        .select('id, full_name, email, subgroup, kingschat_username')
        .eq('event_id', eventId)
        .order('full_name')
      if (error) throw error
      return data || []
    },
  })
}

function rowInfo(row) {
  const m = row.mapped_payload || {}
  const raw = row.raw_payload || {}
  const first = m.first_name || raw['First Name'] || ''
  const last = m.last_name || raw['Last Name'] || ''
  return {
    name: (m.full_name || raw['Full Name'] || `${first} ${last}`).trim() || '(no name)',
    email: m.email || raw.Email || '',
    handle: m.kingschat_username || raw['KingsChat Username'] || '',
  }
}

const nameTokens = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Best guesses first: shared name words, then shared handle/email. */
function rankCandidates(info, participants) {
  const want = new Set(nameTokens(info.name))
  return participants
    .map((p) => {
      let score = nameTokens(p.full_name).filter((t) => want.has(t)).length
      if (info.handle && p.kingschat_username && p.kingschat_username.toLowerCase() === info.handle.toLowerCase()) score += 5
      if (info.email && p.email && p.email.toLowerCase() === info.email.toLowerCase()) score += 5
      return { p, score }
    })
    .sort((a, b) => b.score - a.score || (a.p.full_name || '').localeCompare(b.p.full_name || ''))
}

/**
 * Unmatched rows: pick an existing participant to link, create a new Working List entry
 * from the row, or skip it.
 */
function UnmatchedResolver({ rows, eventId, onResolve, disabled }) {
  const { data: participants = [] } = useEventParticipants(eventId)
  const [choice, setChoice] = useState({})
  const unresolved = rows.filter((r) => r.match_status === 'unmatched' && r.apply_status !== 'skipped')
  const skipped = rows.filter((r) => r.match_status === 'unmatched' && r.apply_status === 'skipped')

  if (unresolved.length === 0 && skipped.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)' }}>
        {unresolved.length > 0 ? `Needs your decision (${unresolved.length})` : 'All unmatched rows resolved'}
      </h4>
      {unresolved.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Link each to an existing participant, or add them to People as a new entry. Rows you skip are left out of this import.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {unresolved.map((row) => {
          const info = rowInfo(row)
          const ranked = rankCandidates(info, participants)
          const selected = choice[row.id] || ''
          return (
            <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: '#fff' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{info.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {[info.email, info.handle && `@${info.handle}`].filter(Boolean).join(' · ') || 'No email or handle'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <select
                  aria-label={`Match ${info.name} to an existing participant`}
                  className="icplc-input"
                  style={{ flex: '1 1 220px', minWidth: 0 }}
                  value={selected}
                  onChange={(e) => setChoice((c) => ({ ...c, [row.id]: e.target.value }))}
                >
                  <option value="">Match to existing participant…</option>
                  {ranked.map(({ p, score }) => (
                    <option key={p.id} value={p.id}>
                      {score > 0 ? '★ ' : ''}{p.full_name}{p.subgroup ? ` — ${p.subgroup}` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="icplc-btn" disabled={!selected || disabled}
                  onClick={() => onResolve(row.id, 'link_existing', selected)}>
                  Link
                </button>
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={disabled}
                  onClick={() => onResolve(row.id, 'create_new')}>
                  Create new entry
                </button>
                <button type="button" className="icplc-btn" disabled={disabled}
                  onClick={() => onResolve(row.id, 'skip')}>
                  Skip
                </button>
              </div>
            </div>
          )
        })}
        {skipped.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Skipped: {skipped.map((r) => rowInfo(r).name).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

/** Compact list of rows already linked to a participant, with how they were matched. */
function MatchedRows({ rows, eventId }) {
  const { data: participants = [] } = useEventParticipants(eventId)
  const matched = rows.filter(isMatchedRow)
  if (matched.length === 0) return null
  const byId = new Map(participants.map((p) => [p.id, p]))
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>Matched ({matched.length})</h4>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
        {matched.map((row, i) => {
          const info = rowInfo(row)
          const target = byId.get(row.participant_id)
          return (
            <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'space-between', padding: '8px 12px', fontSize: 13, borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span>{info.name} <span style={{ color: 'var(--text-secondary)' }}>→ {target?.full_name || 'participant'}</span></span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>by {MATCH_LABELS[row.match_status] || row.match_status}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChangesSummary({ rows }) {
  const matched = rows.filter(isMatchedRow)
  const updates = matched.reduce((acc, r) => {
    const preview = r.changes_preview || {}
    for (const [field, decision] of Object.entries(preview)) {
      if (decision.decision === 'update') acc++
    }
    return acc
  }, 0)
  const protected_ = matched.reduce((acc, r) => {
    const preview = r.changes_preview || {}
    for (const [, decision] of Object.entries(preview)) {
      if (decision.decision === 'protected') acc++
    }
    return acc
  }, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <Stat label="Participants" value={matched.length} />
        <Stat label="Fields to update" value={updates} tone="success" />
        <Stat label="Fields protected" value={protected_} tone="warn" />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Protected fields have active staff overrides and will not be overwritten.
        Each participant is applied atomically — one participant failing does not affect others.
      </p>
    </div>
  )
}

function Stat({ label, value, tone }) {
  const color = tone === 'success' ? '#166534' : tone === 'danger' ? '#991B1B' : tone === 'warn' ? '#92400E' : 'var(--text-primary)'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

const primaryBtn = {
  padding: '8px 18px', background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const ghostBtn = {
  padding: '8px 18px', background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
