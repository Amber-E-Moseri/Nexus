import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { humanize, rowOpenProps } from '../components/ParticipantTable.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import { deriveDocumentation, SUPPORTING_DOC } from '../lib/documentationRules.js'
import { PASSPORT_REGION_LABELS } from '../lib/passportRegion.js'
import {
  DOCUMENT_READINESS_LABELS,
  DOCUMENT_TYPE_LABELS,
  RESIDENCY_STATUS_LABELS,
} from '../../registration/icplcDocReadiness.js'

const PASSPORT_TONES = {
  ready: 'done', renewal_needed: 'at_risk', renewal_in_progress: 'in_progress',
  no_passport: 'blocked', unsure: 'warn', issue: 'blocked', unknown: 'mute',
}
const VISA_PROCESS_TONES = {
  not_started: 'mute', in_progress: 'in_progress', submitted: 'in_progress',
  processing: 'in_progress', approved: 'done', issue: 'blocked', not_applicable: 'mute',
}

const INFO_CARDS = [
  {
    title: 'Canadian Status',
    borderColor: '#93C5FD',
    bg: '#EFF6FF',
    labelColor: '#2563EB',
    textColor: '#374151',
    body: 'Citizen, PR, and work permit holders follow different documentation paths. The document required for entry into the destination country depends on this status.',
  },
  {
    title: 'Passport',
    borderColor: '#86EFAC',
    bg: '#EBF7F1',
    labelColor: '#2D8653',
    textColor: '#374151',
    body: 'Passport readiness tracks whether each participant\'s travel document is valid, in renewal, or missing. Passports must be valid for ≥6 months beyond the event date.',
  },
  {
    title: 'Destination Entry',
    borderColor: '#FCD34D',
    bg: '#FEF6E8',
    labelColor: '#B45309',
    textColor: '#374151',
    body: 'Visa requirements depend on passport country and destination. "Review" means staff must confirm the requirement. Approved or not-required participants are cleared.',
  },
]

export default function DocumentationPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading, error, refetch } = useICPLCParticipants(config?.id, {})

  const [search, setSearch] = useState('')
  const [subgroupFilter, setSubgroupFilter] = useState('')
  const [canadaFilter, setCanadaFilter] = useState('')
  const [passportFilter, setPassportFilter] = useState('')
  const [visaFilter, setVisaFilter] = useState('')

  const subgroups = useMemo(() => {
    if (!participants) return []
    return [...new Set(participants.map((p) => p.subgroup).filter(Boolean))].sort()
  }, [participants])

  const filtered = useMemo(() => {
    if (!participants) return []
    return participants.filter((p) => {
      if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase())) return false
      if (subgroupFilter && p.subgroup !== subgroupFilter) return false
      if (canadaFilter && p.canada_residency_status !== canadaFilter) return false
      if (passportFilter && p.passport_readiness !== passportFilter) return false
      if (visaFilter) {
        const d = deriveDocumentation(p)
        if (d.visa.requirement !== visaFilter) return false
      }
      return true
    })
  }, [participants, search, subgroupFilter, canadaFilter, passportFilter, visaFilter])

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {INFO_CARDS.map((c) => (
          <div key={c.title} style={{ flex: 1, height: 80, background: c.bg, borderRadius: 8, border: `1px solid ${c.borderColor}`, opacity: 0.4 }} />
        ))}
      </div>
      <div style={{ height: 36, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: 300, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load documentation</div>
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
          {error?.message || 'An error occurred while fetching participant data.'}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          style={{
            padding: '5px 12px', background: '#991B1B', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {INFO_CARDS.map((c) => (
          <div
            key={c.title}
            style={{
              flex: '1 1 200px', minWidth: 180,
              background: c.bg,
              border: `1px solid ${c.borderColor}`,
              borderRadius: 8, padding: '14px 16px',
            }}
          >
            <div style={{
              fontSize: 10, fontWeight: 700, color: c.labelColor,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
            }}>{c.title}</div>
            <div style={{ fontSize: 12.5, color: c.textColor, lineHeight: 1.5 }}>{c.body}</div>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          className="icplc-input"
          placeholder="Search participants…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 200 }}
        />
        {subgroups.length > 0 && (
          <select
            className="icplc-input"
            value={subgroupFilter}
            onChange={(e) => setSubgroupFilter(e.target.value)}
            style={{ width: 'auto', minWidth: 120 }}
          >
            <option value="">All subgroups</option>
            {subgroups.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          className="icplc-input"
          value={canadaFilter}
          onChange={(e) => setCanadaFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 130 }}
        >
          <option value="">Canadian status</option>
          {Object.entries(RESIDENCY_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          className="icplc-input"
          value={passportFilter}
          onChange={(e) => setPassportFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 120 }}
        >
          <option value="">Passport</option>
          {['unknown', 'ready', 'renewal_needed', 'renewal_in_progress', 'no_passport', 'unsure', 'issue'].map((v) => (
            <option key={v} value={v}>{humanize(v)}</option>
          ))}
        </select>
        <select
          className="icplc-input"
          value={visaFilter}
          onChange={(e) => setVisaFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 120 }}
        >
          <option value="">Visa</option>
          {['review', 'required', 'not_required'].map((v) => (
            <option key={v} value={v}>{humanize(v)}</option>
          ))}
        </select>
        {(search || subgroupFilter || canadaFilter || passportFilter || visaFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSubgroupFilter(''); setCanadaFilter(''); setPassportFilter(''); setVisaFilter('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}
          >
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
          {filtered.length} of {participants?.length ?? 0}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 8,
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No participants match</div>
          <div style={{ fontSize: 12 }}>Adjust filters to see documentation records.</div>
        </div>
      ) : (
        <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="icplc-table">
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Canadian status</th>
                <th scope="col">Canadian document</th>
                <th scope="col">Passport</th>
                <th scope="col">Additional passport doc</th>
                <th scope="col">Visa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const d = deriveDocumentation(p)
                return (
                  <tr key={p.id} {...rowOpenProps(p.full_name, () => openProfile(p.id, 'documentation'))}>
                    <td data-primary>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
                      {p.subgroup && <div className="icplc-cell-sub">{p.subgroup}</div>}
                    </td>
                    <td data-label="Canadian status">{RESIDENCY_STATUS_LABELS[p.canada_residency_status] || 'Not set'}</td>
                    <td data-label="Canadian document">
                      {d.canadian.required ? (
                        <div className="icplc-cell-stack">
                          <span>{DOCUMENT_TYPE_LABELS[d.canadian.docType]}</span>
                          <span className="icplc-cell-sub">{DOCUMENT_READINESS_LABELS[d.canadian.readiness] || 'Not set'}</span>
                        </div>
                      ) : (
                        <span>{d.canadian.status ? 'None required' : '—'}</span>
                      )}
                    </td>
                    <td data-label="Passport">
                      <div className="icplc-cell-stack">
                        <Badge tone={PASSPORT_TONES[p.passport_readiness] || 'mute'} label={humanize(p.passport_readiness)} />
                        <span className="icplc-cell-sub">
                          {p.passport_country ? `${p.passport_country} · ${PASSPORT_REGION_LABELS[d.passport.region]}` : 'Country not set'}
                        </span>
                      </div>
                    </td>
                    <td data-label="Additional passport doc">
                      {d.passport.supportingDoc === SUPPORTING_DOC.NOT_REQUIRED && 'Not required'}
                      {d.passport.supportingDoc === SUPPORTING_DOC.STAFF_REVIEW && 'Staff review'}
                      {d.passport.supportingDoc === SUPPORTING_DOC.UNKNOWN && '—'}
                    </td>
                    <td data-label="Visa">
                      <div className="icplc-cell-stack">
                        <span>{humanize(d.visa.requirement === 'review' ? 'unknown' : d.visa.requirement)}</span>
                        <Badge tone={VISA_PROCESS_TONES[d.visa.process] || 'mute'} label={humanize(d.visa.process)} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
