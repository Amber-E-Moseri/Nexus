import React, { useRef } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCImport, IMPORT_STEPS } from '../hooks/useICPLCImport.js'
import Badge from '../../../components/ui/Badge.jsx'

export default function ImportsPage() {
  const { config } = useICPLC()
  const fileRef = useRef(null)
  const {
    step, parseResult, rows, applyResult, error, loading,
    uploadCSV, runMatch, runPreview, applyImport, confirmMatch, reset,
  } = useICPLCImport(config?.id)

  const stepIndex = IMPORT_STEPS.indexOf(step)

  return (
    <div style={{ maxWidth: 800 }}>
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
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            style={primaryBtn}
          >
            {loading ? 'Uploading…' : 'Choose CSV file'}
          </button>
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

      {/* Step: Confirm — show preview, let user apply */}
      {step === 'confirm' && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Confirm Import</h3>
          <ChangesSummary rows={rows} />
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={applyImport} disabled={loading} style={primaryBtn}>
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
