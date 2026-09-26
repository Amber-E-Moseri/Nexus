import React, { useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveReadiness } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import ParticipantTable from '../components/ParticipantTable.jsx'
import { DOCUMENT_READINESS, RESIDENCY_STATUS } from '../../registration/icplcDocReadiness.js'

const COHORTS = [
  {
    key: 'blocked',
    label: 'Blocked',
    description: 'Passport issue prevents visa processing',
    filter: (p) => deriveReadiness(p).readiness === 'blocked',
  },
  {
    key: 'action_required',
    label: 'Action Required',
    description: 'Staff attention needed',
    filter: (p) => deriveReadiness(p).readiness === 'action_required',
  },
  {
    key: 'confirmed_no_itinerary',
    label: 'Confirmed - Missing Itinerary',
    description: 'Confirmed attendance but no flight details yet',
    filter: (p) =>
      p.participation_status === 'confirmed' &&
      !p.arrival_flight && !p.arrival_date,
  },
  {
    key: 'registered_unconfirmed',
    label: 'Registered - Not Confirmed',
    description: 'Registered in system but participation not confirmed',
    filter: (p) =>
      p.registration_status === 'registered' &&
      !['confirmed', 'likely'].includes(p.participation_status),
  },
  {
    key: 'visa_not_started',
    label: 'Visa Required - Not Started',
    description: 'Visa required but process not yet started',
    filter: (p) =>
      p.visa_requirement === 'required' &&
      p.visa_process_status === 'not_started',
  },
  {
    key: 'canadian_status_unknown',
    label: 'Canadian Status Unknown',
    description: 'Canadian status has not been collected for this participant',
    filter: (p) => !p.canada_residency_status,
  },
  {
    key: 'canadian_status_review',
    label: 'Canadian Status Needs Review',
    description: 'Visitor/Other status requires staff review',
    filter: (p) => p.canada_residency_status === RESIDENCY_STATUS.VISITOR_OTHER,
  },
  {
    key: 'canadian_doc_renewal',
    label: 'Canadian Document Renewal Needed',
    description: 'Required Canadian status document needs renewal',
    filter: (p) => p.canada_status_document_readiness === DOCUMENT_READINESS.RENEWAL_NEEDED,
  },
  {
    key: 'canadian_doc_issue',
    label: 'Canadian Document Issue',
    description: 'Required Canadian status document has an issue',
    filter: (p) => p.canada_status_document_readiness === DOCUMENT_READINESS.ISSUE,
  },
]

export default function NeedsAttentionPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile } = useICPLC()
  const { data: participants, isLoading } = useICPLCParticipants(config?.id, {})

  const cohorts = useMemo(() => {
    if (!participants) return []
    return COHORTS.map((c) => ({
      ...c,
      participants: participants.filter(c.filter),
    })).filter((c) => c.participants.length > 0)
  }, [participants])

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>
  if (!cohorts.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        No items need attention right now.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {cohorts.map((c) => (
        <section key={c.key}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
              {c.label}
              <span style={{
                marginLeft: 8, fontSize: 12, fontWeight: 400,
                background: 'var(--surface-2)', borderRadius: 10, padding: '1px 8px',
              }}>
                {c.participants.length}
              </span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.description}</div>
          </div>
          <ParticipantTable participants={c.participants} loading={false} />
        </section>
      ))}

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
