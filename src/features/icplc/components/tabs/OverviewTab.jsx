import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { deriveReadiness, readinessTone, readinessLabel, deriveTravelStatus } from '../../lib/readinessEngine.js'
import Badge from '../../../../components/ui/Badge.jsx'
import { supabase } from '../../../../lib/supabase.js'
import { useAddTag, useRemoveTag } from '../../hooks/useICPLCProfile.js'
import { useAuth } from '../../../../hooks/useAuth.js'

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

export default function OverviewTab({ participant, canWrite }) {
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
      <TagsSection participant={participant} canWrite={canWrite} />

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

function TagsSection({ participant, canWrite }) {
  const { profile } = useAuth()
  const [showPicker, setShowPicker] = useState(false)
  const addTag = useAddTag()
  const removeTag = useRemoveTag()

  const { data: allTags } = useQuery({
    queryKey: ['icplc_tags', participant.event_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_tags')
        .select('*')
        .or(`event_id.eq.${participant.event_id},event_id.is.null`)
        .order('sort_order')
      if (error) throw error
      return data || []
    },
    enabled: canWrite,
    staleTime: 60_000,
  })

  const assignedIds = new Set((participant.tags || []).map((t) => t.id))
  const unassigned = (allTags || []).filter((t) => !assignedIds.has(t.id))
  const hasTags = participant.tags?.length > 0

  if (!hasTags && !canWrite) return null

  return (
    <section>
      <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Tags</h4>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {(participant.tags || []).map((t) => (
          <span
            key={t.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 12, fontSize: 12,
              background: t.color || 'var(--surface-2)',
              color: '#fff',
            }}
          >
            {t.name}
            {canWrite && (
              <button
                onClick={() => removeTag.mutate({ participantId: participant.id, tagId: t.id })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, opacity: 0.7, fontSize: 13 }}
                title="Remove tag"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {canWrite && unassigned.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPicker((p) => !p)}
              style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: '1px dashed var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              + Add tag
            </button>

            {showPicker && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 10,
                background: 'var(--surface-1)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                padding: 8, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                {unassigned.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      addTag.mutate({ participantId: participant.id, tagId: t.id, addedBy: profile?.id })
                      setShowPicker(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4,
                      fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: t.color || 'var(--surface-2)' }} />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {canWrite && !hasTags && unassigned.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No tags available. Add some in Settings.</span>
        )}
      </div>
    </section>
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
