import React from 'react'
import { deriveReadiness, readinessTone, readinessLabel, deriveTravelStatus } from '../../lib/readinessEngine.js'
import Badge from '../../../../components/ui/Badge.jsx'

const PARTICIPATION_LABELS = {
  tracking: 'Tracking',
  likely: 'Likely',
  confirmed: 'Confirmed',
  uncertain: 'Uncertain',
  not_attending: 'Not Attending',
}

const PARTICIPATION_TONES = {
  tracking: 'mute',
  likely: 'in_progress',
  confirmed: 'done',
  uncertain: 'at_risk',
  not_attending: 'blocked',
}

export default function OverviewTab({ participant }) {
  const { readiness, reasons } = deriveReadiness(participant)
  const travelStatus = deriveTravelStatus(participant)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Identity */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Full Name" value={participant.full_name} />
          <Field label="Email" value={participant.email} />
          <Field label="Region" value={participant.region} />
          <Field label="Subgroup" value={participant.subgroup} />
          <Field label="Group" value={participant.group_name} />
          <Field label="Leadership" value={participant.leadership} />
        </div>
      </section>

      {/* Operational Status */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Operational Status
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Participation</div>
            <Badge
              tone={PARTICIPATION_TONES[participant.participation_status] || 'mute'}
              label={PARTICIPATION_LABELS[participant.participation_status] || participant.participation_status}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Readiness</div>
            <Badge tone={readinessTone(readiness)} label={readinessLabel(readiness)} />
            {reasons.length > 0 && (
              <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Registration</div>
            <Badge tone={registrationTone(participant.registration_status)} label={participant.registration_status} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Travel</div>
            <Badge
              tone={travelStatus === 'ready' ? 'done' : 'warn'}
              label={travelStatus === 'ready' ? 'Ready' : 'Outstanding'}
            />
          </div>
        </div>
      </section>

      {/* Tags */}
      {participant.tags?.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Tags</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {participant.tags.map((t) => (
              <span
                key={t.id}
                className="fchip"
                style={{ background: t.color || 'var(--surface-2)', fontSize: 12 }}
              >
                {t.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {participant.notes && (
        <section>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Notes</h4>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {participant.notes}
          </p>
        </section>
      )}
    </div>
  )
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function registrationTone(status) {
  switch (status) {
    case 'registered': return 'done'
    case 'not_registered': return 'at_risk'
    case 'issue': return 'blocked'
    default: return 'mute'
  }
}
