import React, { useRef, useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCImport, IMPORT_STEPS } from '../hooks/useICPLCImport.js'

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
      const lines = text.trim().split('\n')
      if (lines.length < 2) throw new Error('CSV must have at least a header row')

      const headers = lines[0].split(',').map(h => h.trim())
      const headerMap = Object.fromEntries(headers.map((h, i) => [h, i]))

      const requiredCols = ['email', 'fullName']
      for (const col of requiredCols) {
        if (!(col in headerMap)) throw new Error(`Missing required column: ${col}`)
      }

      const { supabase } = await import('../../../lib/supabase')
      const rows = []
      let skipped = 0
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const fields = line.split(',').map(f => f.trim())
        const email = fields[headerMap['email']]?.trim()

        // Skip rows without email (required field)
        if (!email) {
          skipped++
          continue
        }

        rows.push({
          email,
          full_name: fields[headerMap['fullName']]?.trim() || '',
          phone_number: fields[headerMap['phone']]?.trim() || '',
        })
      }

      if (rows.length === 0) {
        throw new Error(skipped > 0 ? `No valid rows found (${skipped} skipped due to missing email)` : 'CSV has no data rows')
      }

      // Insert into icplc_participants
      const rowsWithEventId = rows.map(r => ({
        event_id: config?.id,
        full_name: r.full_name,
        email: r.email,
        registration_status: 'unknown',
        participation_status: 'tracking',
      }))

      // Use insert (not upsert) to avoid duplicates by email
      const { data, error: err } = await supabase
        .from('icplc_participants')
        .insert(rowsWithEventId)
        .select()
      if (err) {
        if (err.message.includes('duplicate')) {
          throw new Error('Some emails already exist as participants. Use the Registration CSV importer to update existing participants.')
        }
        throw err
      }

      setResult({ imported: data?.length || 0 })
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
          Successfully imported <strong>{result.imported}</strong> participants to ICPLC.
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
            Discovery and field mapping engine are ready. The Sync/Apply action is disabled pending database certification.
            Upload and preview are read-only and safe. No external API calls occur during local certification.
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

      {/* Disabled apply */}
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Sync Action</h3>
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px',
          background: 'var(--surface-2)',
        }}>
          <button
            type="button"
            disabled
            style={{
              padding: '8px 18px', background: 'var(--surface-2)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'not-allowed', fontSize: 13, opacity: 0.6,
            }}
          >
            Run CMP Sync
          </button>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            Final database certification required before CMP sync can apply data.
          </div>
        </div>
      </section>
    </div>
  )
}

export default function ImportsPage() {
  const { config } = useICPLC()
  const fileRef = useRef(null)
  const [source, setSource] = useState('csv')
  const {
    step, parseResult, rows, applyResult, error, loading,
    uploadCSV, runMatch, runPreview, applyImport, confirmMatch, reset,
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

          {/* Unmatched rows */}
          {rows.filter((r) => r.match_status === 'unmatched').length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
                Unmatched rows ({rows.filter((r) => r.match_status === 'unmatched').length})
              </h4>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                These rows could not be matched to existing participants. You can skip them or resolve manually.
              </p>
            </div>
          )}

          {/* Match summary */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Stat label="Total" value={rows.length} />
            <Stat label="Matched" value={rows.filter((r) => ['auto','manual','persistent'].includes(r.match_status)).length} tone="success" />
            <Stat label="Unmatched" value={rows.filter((r) => r.match_status === 'unmatched').length} tone="warn" />
          </div>

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
          <button onClick={reset} style={ghostBtn}>Start another import</button>
        </div>
      )}
      </>)}
    </div>
  )
}

function ChangesSummary({ rows }) {
  const matched = rows.filter((r) => ['auto','manual','persistent'].includes(r.match_status))
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
