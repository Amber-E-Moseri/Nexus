import React from 'react'
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

/**
 * Documentation overview. Canadian status, passport and visa are separate columns —
 * none of them is derived from another.
 */
export default function DocumentationPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading, error } = useICPLCParticipants(config?.id, {})

  if (isLoading) return <div role="status" style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>
  if (error) return <div role="alert" style={{ padding: 40, color: 'var(--text-secondary)' }}>Failed to load documentation.</div>

  return (
    <div>
      <div role="status" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {participants?.length ?? 0} participants
      </div>
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
            {(participants || []).map((p) => {
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
