import React, { useState, useMemo } from 'react'
import { applyClientFilters } from '../lib/participantFilters.js'
import { useICPLC } from '../ICPLCContext.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import { deriveReadiness, readinessTone, readinessLabel, deriveFlightStatus, flightStatusTone, flightStatusLabel } from '../lib/readinessEngine.js'
import { deriveDocumentation, attentionCategoryKeys, registrationState, REGISTRATION_STATE_LABELS } from '../lib/documentationRules.js'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_READINESS_LABELS } from '../../registration/icplcDocReadiness.js'
import { PASSPORT_REGION_LABELS } from '../lib/passportRegion.js'

const REGISTRATION_TONES = { registered: 'done', registration_missing: 'blocked', not_registered: 'at_risk' }

const CONFIRMATION_MAP = {
  confirmed:    { label: 'Confirmed',    tone: 'done' },
  likely:       { label: 'Confirming',   tone: 'in_progress' },
  tracking:     { label: 'Unconfirmed',  tone: 'mute' },
  uncertain:    { label: 'Unconfirmed',  tone: 'mute' },
  not_attending: { label: 'Not Attending', tone: 'blocked' },
}

/** Props that make a table row an accessible button-like target (click / Enter / Space). */
export function rowOpenProps(name, open, extraStyle) {
  return {
    className: 'icplc-row',
    tabIndex: 0,
    'aria-label': `Open ${name}`,
    onClick: open,
    style: extraStyle,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
    },
  }
}

export function humanize(value) {
  const s = String(value ?? '').replace(/_/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

export default function ParticipantTable({ participants, loading, profileTab }) {
  const { openProfile, filters } = useICPLC()
  const [sortField, setSortField] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

  // Client-side filters on derived values (readiness, flight_status, effective visa) and joined tags
  const filtered = useMemo(() => applyClientFilters(participants, { ...filters, visa_requirement: [] }), [participants, filters])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va = a[sortField] ?? ''
    let vb = b[sortField] ?? ''
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  }), [filtered, sortField, sortDir])

  if (loading) {
    return <div role="status" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading participants…</div>
  }
  if (!sorted.length) {
    return <div role="status" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No participants match current filters.</div>
  }

  return (
    <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
      <table className="icplc-table">
        <thead>
          <tr>
            <SortTh field="full_name"           label="Person"       active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="subgroup"             label="Group"        active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="registration_status" label="Registration" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="participation_status" label="Confirmation" active={sortField} dir={sortDir} onClick={handleSort} />
            <th scope="col">Canadian doc</th>
            <th scope="col">Passport</th>
            <th scope="col">Visa</th>
            <th scope="col">Travel</th>
            <th scope="col">Readiness</th>
            <th scope="col">Attention</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => <Row key={p.id} p={p} onOpen={(id) => openProfile(id, profileTab)} />)}
        </tbody>
      </table>
    </div>
  )
}

function Row({ p, onOpen }) {
  const registration = registrationState(p) // registered | registration_missing | not_registered
  const { readiness } = deriveReadiness(p)
  const flightStatus = deriveFlightStatus(p)
  const flightMissing = flightStatus === 'missing'
  const documentation = deriveDocumentation(p)
  const attentionKeys = attentionCategoryKeys(p)
  const confirmation = CONFIRMATION_MAP[p.participation_status] || { label: humanize(p.participation_status), tone: 'mute' }
  const open = () => onOpen(p.id)

  const rowStyle = flightMissing
    ? { background: 'var(--icplc-amber-bg, rgba(245, 158, 11, 0.08))' }
    : undefined

  return (
    <tr {...rowOpenProps(p.full_name, open, rowStyle)}>
      {/* Person */}
      <td data-primary>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
        {p.email && <div className="icplc-cell-sub" style={{ overflowWrap: 'anywhere' }}>{p.email}</div>}
        {p.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {p.tags.map((t) => (
              <span key={t.id} className="fchip" style={{ fontSize: 11, background: t.color || 'var(--surface-2)' }}>{t.name}</span>
            ))}
          </div>
        )}
      </td>

      {/* Group */}
      <td data-label="Group">
        {p.subgroup || p.region ? (
          <div className="icplc-cell-stack">
            {p.subgroup && <span style={{ fontSize: 13 }}>{p.subgroup}</span>}
            {p.region && <span className="icplc-cell-sub">{p.region}</span>}
          </div>
        ) : (
          <span style={{ color: 'var(--icplc-text-muted, var(--text-tertiary))' }}>—</span>
        )}
      </td>

      {/* Registration */}
      <td data-label="Registration">
        <Badge tone={REGISTRATION_TONES[registration]} label={REGISTRATION_STATE_LABELS[registration]} />
      </td>

      {/* Confirmation */}
      <td data-label="Confirmation">
        <Badge tone={confirmation.tone} label={confirmation.label} />
      </td>

      {/* Canadian doc */}
      <td data-label="Canadian doc">
        <div className="icplc-cell-stack">
          <span style={{ fontSize: 13 }}>{DOCUMENT_TYPE_LABELS[documentation.canadian.docType] || 'Needs Review'}</span>
          <span className="icplc-cell-sub">
            {documentation.canadian.attention
              ? 'Not ready'
              : DOCUMENT_READINESS_LABELS[documentation.canadian.readiness] || 'Not set'}
          </span>
          {documentation.canadian.attention && (
            <span className="icplc-cell-sub">{documentation.canadian.attention}</span>
          )}
        </div>
      </td>

      {/* Passport */}
      <td data-label="Passport">
        <div className="icplc-cell-stack">
          <span style={{ fontSize: 13 }}>
            {documentation.passport.country
              ? `${documentation.passport.country} · ${PASSPORT_REGION_LABELS[documentation.passport.region]}`
              : PASSPORT_REGION_LABELS[documentation.passport.region]}
          </span>
          <span className="icplc-cell-sub">{humanize(documentation.passport.readiness)}</span>
        </div>
      </td>

      {/* Visa */}
      <td data-label="Visa">
        <div className="icplc-cell-stack">
          <span style={{ fontSize: 13 }}>{humanize(documentation.visa.requirement)}</span>
          {documentation.visa.requirement !== 'not_required' && (
            <span className="icplc-cell-sub">{humanize(documentation.visa.process)}</span>
          )}
        </div>
      </td>

      {/* Travel */}
      <td data-label="Travel">
        <Badge tone={flightStatusTone(flightStatus)} label={flightStatusLabel(flightStatus)} />
      </td>

      {/* Readiness */}
      <td data-label="Readiness">
        <Badge tone={readinessTone(readiness)} label={readiness === 'ready' ? 'Ready' : readinessLabel(readiness)} />
      </td>

      {/* Attention */}
      <td data-label="Attention">
        <AttentionCell keys={attentionKeys} flightMissing={flightMissing} />
      </td>
    </tr>
  )
}

/**
 * Builds the ordered list of attention items for the Attention column.
 * Exported for unit tests.
 *
 * Rules:
 * - If flightMissing, prepend a synthetic '__flight__' item.
 * - Filter 'travel_incomplete' from attentionKeys — it is the structural
 *   equivalent of the flight warning; showing both would duplicate the message.
 * - All other attentionKeys are preserved in order.
 */
export function deriveAttentionItems(keys, flightMissing) {
  const otherKeys = keys.filter((k) => k !== 'travel_incomplete')
  return [
    ...(flightMissing ? ['__flight__'] : []),
    ...otherKeys,
  ]
}

function AttentionCell({ keys, flightMissing }) {
  const items = deriveAttentionItems(keys, flightMissing)

  if (!items.length) {
    return <span style={{ color: 'var(--icplc-text-muted, var(--text-tertiary))' }}>—</span>
  }

  const displayed = items.slice(0, 3)
  const overflow = items.length - displayed.length

  return (
    <ul className="icplc-reasons" style={{ margin: 0 }}>
      {displayed.map((k) =>
        k === '__flight__' ? (
          <li key="__flight__" style={{ color: 'var(--icplc-amber, #B45309)', fontWeight: 500 }}>
            Flight details missing
          </li>
        ) : (
          <li key={k}>{k === 'not_registered' ? 'Not registered' : k === 'registration_missing' ? 'Registration missing' : humanize(k)}</li>
        )
      )}
      {overflow > 0 && <li>+{overflow} more</li>}
    </ul>
  )
}

function SortTh({ field, label, active, dir, onClick }) {
  const isActive = active === field
  return (
    <th scope="col" aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onClick(field)}>
        {label}
        {isActive && <span aria-hidden style={{ marginLeft: 4, fontSize: 10 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}
