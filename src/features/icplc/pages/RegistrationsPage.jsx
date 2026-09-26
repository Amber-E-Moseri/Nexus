import React, { useMemo, useState } from 'react'
import { Eye, Search, UserPlus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import {
  REGISTRATION_SOURCE_TYPE,
  registrationDisplayName,
  registrationSourceKey,
  reconciliationState,
} from '../lib/reconciliation.js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const STATE_TONES = {
  MATCHED: 'done',
  POSSIBLE_MATCH: 'at_risk',
  UNMATCHED: 'mute',
}

export default function RegistrationsPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const qc = useQueryClient()
  const [reviewing, setReviewing] = useState(null)
  const [sourceRow, setSourceRow] = useState(null)

  const { data: participants = [], isLoading: participantsLoading } = useICPLCParticipants(eventId, {})
  const { data: registrations = [], isLoading: registrationsLoading } = useQuery({
    queryKey: ['icplc_registrations', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_config_id', eventId)
        .order('submitted_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
  const { data: maps = [], isLoading: mapsLoading } = useQuery({
    queryKey: ['icplc_registration_identity_maps', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_identity_maps')
        .select('*')
        .eq('event_id', eventId)
        .eq('source_type', REGISTRATION_SOURCE_TYPE)
      if (error) throw error
      return data || []
    },
  })

  const mapBySourceKey = useMemo(
    () => new Map(maps.map((m) => [m.source_key, m])),
    [maps],
  )

  const rows = useMemo(() => registrations.map((registration) => {
    const state = reconciliationState(
      registration,
      participants,
      mapBySourceKey.get(registrationSourceKey(registration)),
    )
    return { registration, ...state }
  }), [registrations, participants, mapBySourceKey])

  const summary = useMemo(() => ({
    registered: registrations.length,
    matched: rows.filter((r) => r.state === 'MATCHED').length,
    review: rows.filter((r) => r.state === 'POSSIBLE_MATCH').length,
    unmatched: rows.filter((r) => r.state === 'UNMATCHED').length,
  }), [registrations.length, rows])

  const confirmMatch = useMutation({
    mutationFn: async ({ registration, participant }) => {
      const sourceKey = registrationSourceKey(registration)
      if (!sourceKey) throw new Error('Registration is missing a stable id')
      const sourceValue = {
        value: 'registered',
        source: REGISTRATION_SOURCE_TYPE,
        registration_id: registration.id,
        observed_at: new Date().toISOString(),
      }
      const nextSourceValues = {
        ...(participant.source_values || {}),
        registration_status: sourceValue,
        registration_source: {
          registration_id: registration.id,
          email: registration.email || null,
          submitted_at: registration.submitted_at || null,
        },
      }

      const { error: mapError } = await supabase
        .from('icplc_identity_maps')
        .upsert({
          event_id: eventId,
          source_type: REGISTRATION_SOURCE_TYPE,
          source_key: sourceKey,
          participant_id: participant.id,
        }, { onConflict: 'event_id,source_type,source_key' })
      if (mapError) throw mapError

      const { error: participantError } = await supabase
        .from('icplc_participants')
        .update({
          registration_status: 'registered',
          source_values: nextSourceValues,
        })
        .eq('id', participant.id)
      if (participantError) throw participantError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['icplc_registration_identity_maps', eventId] })
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      setReviewing(null)
    },
  })

  const createFromRegistration = useMutation({
    mutationFn: async (registration) => {
      const sourceKey = registrationSourceKey(registration)
      const fullName = registrationDisplayName(registration)
      if (!sourceKey) throw new Error('Registration is missing a stable id')
      if (!fullName) throw new Error('Registration is missing a name')

      const { data: participant, error: createError } = await supabase
        .from('icplc_participants')
        .insert({
          event_id: eventId,
          full_name: fullName,
          email: registration.email || null,
          subgroup: registration.subgroup || null,
          registration_status: 'registered',
          source_values: {
            registration_status: {
              value: 'registered',
              source: REGISTRATION_SOURCE_TYPE,
              registration_id: registration.id,
              observed_at: new Date().toISOString(),
            },
            registration_source: {
              registration_id: registration.id,
              email: registration.email || null,
              submitted_at: registration.submitted_at || null,
            },
          },
        })
        .select()
        .single()
      if (createError) throw createError

      const { error: mapError } = await supabase
        .from('icplc_identity_maps')
        .insert({
          event_id: eventId,
          source_type: REGISTRATION_SOURCE_TYPE,
          source_key: sourceKey,
          participant_id: participant.id,
        })
      if (mapError) throw mapError
      return participant
    },
    onSuccess: (participant) => {
      qc.invalidateQueries({ queryKey: ['icplc_registration_identity_maps', eventId] })
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      setReviewing(null)
      openProfile(participant.id, 'registration')
    },
  })

  const loading = participantsLoading || registrationsLoading || mapsLoading
  if (loading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading registrations...</div>

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Stat label="Registered" value={summary.registered} />
        <Stat label="Matched" value={summary.matched} tone="success" />
        <Stat label="Needs Review" value={summary.review} tone="warn" />
        <Stat label="New / Unmatched" value={summary.unmatched} />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr>
              <th style={thStyle}>Registration</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Match State</th>
              <th style={thStyle}>Matched Participant</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.registration.id}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{registrationDisplayName(row.registration) || 'Unnamed registration'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.registration.email || 'No email'}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontSize: 12 }}>registrations</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(row.registration.submitted_at)}</div>
                </td>
                <td style={tdStyle}>
                  <Badge tone={STATE_TONES[row.state] || 'mute'} label={stateLabel(row.state)} />
                  {row.candidates.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {row.candidates.length} candidate{row.candidates.length === 1 ? '' : 's'}
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  {row.participant ? (
                    <button onClick={() => openProfile(row.participant.id, 'registration')} style={linkBtn}>
                      {row.participant.full_name}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {row.state === 'MATCHED' && row.participant && (
                      <button onClick={() => openProfile(row.participant.id, 'registration')} style={smallBtn}><Eye size={13} /> View participant</button>
                    )}
                    <button onClick={() => setSourceRow(row.registration)} style={smallBtn}>View source</button>
                    {row.state !== 'MATCHED' && canWrite && (
                      <>
                        <button onClick={() => setReviewing(row)} style={smallBtn}><Search size={13} /> Review</button>
                        <button onClick={() => createFromRegistration.mutate(row.registration)} disabled={createFromRegistration.isPending} style={smallBtn}><UserPlus size={13} /> Create participant</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewing && (
        <MatchReview
          row={reviewing}
          participants={participants}
          onClose={() => setReviewing(null)}
          onConfirm={(participant) => confirmMatch.mutate({ registration: reviewing.registration, participant })}
          onCreate={() => createFromRegistration.mutate(reviewing.registration)}
          saving={confirmMatch.isPending || createFromRegistration.isPending}
        />
      )}

      {sourceRow && <SourceModal registration={sourceRow} onClose={() => setSourceRow(null)} />}

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

function MatchReview({ row, participants, onClose, onConfirm, onCreate, saving }) {
  const [query, setQuery] = useState('')
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? participants.filter((p) => `${p.full_name || ''} ${p.email || ''}`.toLowerCase().includes(q))
      : row.candidates.map((c) => c.participant)
    return base.slice(0, 25)
  }, [participants, query, row.candidates])

  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Review Registration Match</h3>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Confirm a durable link. The original registration remains unchanged.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <CompareCard title="Incoming Registration" rows={[
            ['Name', registrationDisplayName(row.registration) || '-'],
            ['Email', row.registration.email || '-'],
            ['Phone', row.registration.phone || '-'],
            ['Subgroup', row.registration.subgroup || '-'],
          ]} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Possible Participants</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search another participant..."
              style={inputStyle}
            />
            <div style={{ display: 'grid', gap: 8, marginTop: 10, maxHeight: 260, overflow: 'auto' }}>
              {candidates.map((participant) => (
                <button key={participant.id} onClick={() => onConfirm(participant)} disabled={saving} style={candidateBtn}>
                  <span>
                    <strong>{participant.full_name}</strong>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>{participant.email || 'No email'} · {participant.subgroup || 'No subgroup'}</span>
                  </span>
                </button>
              ))}
              {candidates.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No candidates found.</div>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={onCreate} disabled={saving} style={primaryBtn}>Create new participant</button>
        </div>
      </div>
    </div>
  )
}

function SourceModal({ registration, onClose }) {
  return (
    <div style={modalOverlay}>
      <div style={{ ...modalCard, maxWidth: 760 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Source Registration</h3>
        <pre style={{
          maxHeight: 460,
          overflow: 'auto',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: 12,
          fontSize: 12,
        }}>{JSON.stringify(registration, null, 2)}</pre>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={primaryBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

function CompareCard({ title, rows }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: 8, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--surface-2)' }}>{label}</div>
            <div style={{ padding: 8, fontSize: 12 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  const color = tone === 'success' ? '#166534' : tone === 'warn' ? '#92400E' : 'var(--text-primary)'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--surface-1)' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

function stateLabel(state) {
  if (state === 'MATCHED') return 'Matched'
  if (state === 'POSSIBLE_MATCH') return 'Possible match'
  return 'New / unmatched'
}

function formatDate(value) {
  if (!value) return 'No date'
  try { return new Date(value).toLocaleDateString() } catch { return value }
}

const thStyle = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 13 }
const smallBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 9px',
  border: '1px solid var(--border)',
  background: 'var(--surface-1)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
}
const linkBtn = { border: 'none', background: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 20 }
const modalCard = { width: 'min(920px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: 'var(--surface-1)', borderRadius: 8, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }
const candidateBtn = { textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface-1)', borderRadius: 6, padding: 10, cursor: 'pointer' }
const primaryBtn = { padding: '7px 14px', border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white', cursor: 'pointer', fontSize: 13 }
const ghostBtn = { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }
