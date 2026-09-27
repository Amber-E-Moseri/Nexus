import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import { deriveReadiness, deriveTravelStatus, readinessLabel, readinessTone } from '../lib/readinessEngine.js'
import { deriveDocumentation, SUPPORTING_DOC } from '../lib/documentationRules.js'
import { PASSPORT_REGION_LABELS } from '../lib/passportRegion.js'
import {
  DOCUMENT_READINESS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from '../../registration/icplcDocReadiness.js'

const PARTICIPATION_TONES = {
  tracking: 'mute', likely: 'in_progress', confirmed: 'done',
  uncertain: 'at_risk', not_attending: 'blocked',
}
const REGISTRATION_TONES = { registered: 'done', not_registered: 'at_risk', issue: 'blocked', unknown: 'mute' }
const PASSPORT_TONES = {
  ready: 'done', renewal_needed: 'at_risk', renewal_in_progress: 'in_progress',
  no_passport: 'blocked', unsure: 'warn', issue: 'blocked', unknown: 'mute',
}
const VISA_TONES = {
  not_started: 'mute', in_progress: 'in_progress', submitted: 'in_progress', processing: 'in_progress',
  approved: 'done', issue: 'blocked', not_applicable: 'mute',
}

/** Props that make a table row an accessible button-like target (click / Enter / Space). */
export function rowOpenProps(name, open) {
  return {
    className: 'icplc-row',
    tabIndex: 0,
    'aria-label': `Open ${name}`,
    onClick: open,
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

  // Client-side filters on derived values (readiness is never a DB column)
  const filtered = useMemo(() => {
    let rows = participants || []
    if (filters.readiness?.length > 0) {
      rows = rows.filter((p) => filters.readiness.includes(deriveReadiness(p).readiness))
    }
    if (filters.tags?.length > 0) {
      rows = rows.filter((p) => p.tags?.some((t) => filters.tags.includes(t.name)))
    }
    return rows
  }, [participants, filters.readiness, filters.tags])

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
            <SortTh field="full_name" label="Participant" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="registration_status" label="Registration" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="participation_status" label="Participation" active={sortField} dir={sortDir} onClick={handleSort} />
            <th scope="col">Canadian doc</th>
            <SortTh field="passport_readiness" label="Passport" active={sortField} dir={sortDir} onClick={handleSort} />
            <SortTh field="visa_requirement" label="Visa" active={sortField} dir={sortDir} onClick={handleSort} />
            <th scope="col">Travel</th>
            <th scope="col">Readiness</th>
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
  const registration = p.registration_link_status || p.registration_status
  const doc = deriveDocumentation(p)
  const { readiness, reasons } = deriveReadiness(p)
  const travel = deriveTravelStatus(p)
  const open = () => onOpen(p.id)
  return (
    <tr {...rowOpenProps(p.full_name, open)}>
      <td data-primary>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
        {p.email && <div className="icplc-cell-sub" style={{ overflowWrap: 'anywhere' }}>{p.email}</div>}
        {(p.subgroup || p.region) && (
          <div className="icplc-cell-sub">{[p.subgroup, p.region].filter(Boolean).join(' · ')}</div>
        )}
        {p.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {p.tags.map((t) => (
              <span key={t.id} className="fchip" style={{ fontSize: 11, background: t.color || 'var(--surface-2)' }}>{t.name}</span>
            ))}
          </div>
        )}
      </td>
      <td data-label="Registration">
        <Badge tone={REGISTRATION_TONES[registration] || 'mute'} label={humanize(registration)} />
      </td>
      <td data-label="Participation">
        <Badge tone={PARTICIPATION_TONES[p.participation_status] || 'mute'} label={humanize(p.participation_status)} />
      </td>
      <td data-label="Canadian doc">
        {doc.canadian.required ? (
          <div className="icplc-cell-stack">
            <span>{DOCUMENT_TYPE_LABELS[doc.canadian.docType]}</span>
            <span className="icplc-cell-sub">
              {DOCUMENT_READINESS_LABELS[doc.canadian.readiness] || 'Not set'}
            </span>
          </div>
        ) : (
          <div className="icplc-cell-stack">
            <span>{doc.canadian.status ? 'None required' : 'Status not set'}</span>
          </div>
        )}
      </td>
      <td data-label="Passport">
        <div className="icplc-cell-stack">
          <Badge tone={PASSPORT_TONES[p.passport_readiness] || 'mute'} label={humanize(p.passport_readiness)} />
          <span className="icplc-cell-sub">
            {p.passport_country ? `${p.passport_country} · ${PASSPORT_REGION_LABELS[doc.passport.region]}` : 'Country not set'}
            {doc.passport.supportingDoc === SUPPORTING_DOC.STAFF_REVIEW ? ' · review' : ''}
          </span>
        </div>
      </td>
      <td data-label="Visa">
        <div className="icplc-cell-stack">
          <span>{humanize(doc.visa.requirement === 'review' ? 'unknown' : doc.visa.requirement)}</span>
          {doc.visa.requirement === 'required' && (
            <Badge tone={VISA_TONES[doc.visa.process] || 'mute'} label={humanize(doc.visa.process)} />
          )}
        </div>
      </td>
      <td data-label="Travel">
        <Badge tone={travel === 'ready' ? 'done' : 'warn'} label={travel === 'ready' ? 'Ready' : 'Outstanding'} />
      </td>
      <td data-label="Readiness">
        <div className="icplc-cell-stack">
          <Badge tone={readinessTone(readiness)} label={readiness === 'ready' ? 'Ready' : `Not ready · ${readinessLabel(readiness)}`} />
          {reasons.length > 0 && (
            <ul className="icplc-reasons">
              {reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
              {reasons.length > 3 && <li>+{reasons.length - 3} more</li>}
            </ul>
          )}
        </div>
      </td>
    </tr>
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
