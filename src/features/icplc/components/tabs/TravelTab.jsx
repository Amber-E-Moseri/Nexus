import React, { useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { overrideFieldsForEdit } from '../../lib/fieldAuthority.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../../lib/readinessEngine.js'
import Badge from '../../../../components/ui/Badge.jsx'

export default function TravelTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    arrival_date: participant.arrival_date || '',
    arrival_time: participant.arrival_time || '',
    arrival_flight: participant.arrival_flight || '',
    departure_date: participant.departure_date || '',
    departure_time: participant.departure_time || '',
    departure_flight: participant.departure_flight || '',
  })

  const itineraryStatus = deriveItineraryStatus(participant)
  const travelStatus = deriveTravelStatus(participant)

  async function handleSave() {
    const changed = {}
    for (const key of Object.keys(form)) {
      const val = form[key] || null
      const cur = participant[key] || null
      if (val !== cur) changed[key] = val
    }
    if (Object.keys(changed).length === 0) { setEditing(false); return }
    // Imports may write itinerary fields — record staff edits as overrides so they survive re-imports.
    const overrideFields = overrideFieldsForEdit(Object.keys(changed))
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: changed,
      setOverride: overrideFields.length > 0,
      overrideFields,
      userId: authProfile?.id,
    })
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Derived status chips */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Itinerary</div>
          <Badge
            tone={itineraryStatus === 'received' ? 'done' : 'warn'}
            label={itineraryStatus === 'received' ? 'Received' : 'Missing'}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Travel Status</div>
          <Badge
            tone={travelStatus === 'ready' ? 'done' : 'at_risk'}
            label={travelStatus === 'ready' ? 'Ready' : 'Outstanding'}
          />
        </div>
      </div>

      {/* Arrival */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Arrival
        </h4>
        <div className="icplc-field-grid">
          <FlightField
            label="Date" type="date" field="arrival_date"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, arrival_date: v }))}
          />
          <FlightField
            label="Time" type="text" field="arrival_time"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, arrival_time: v }))}
          />
          <FlightField
            label="Flight" type="text" field="arrival_flight"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, arrival_flight: v }))}
          />
        </div>
      </section>

      {/* Departure */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Departure
        </h4>
        <div className="icplc-field-grid">
          <FlightField
            label="Date" type="date" field="departure_date"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, departure_date: v }))}
          />
          <FlightField
            label="Time" type="text" field="departure_time"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, departure_time: v }))}
          />
          <FlightField
            label="Flight" type="text" field="departure_flight"
            form={form} participant={participant} editing={editing && canWrite}
            onChange={(v) => setForm((f) => ({ ...f, departure_flight: v }))}
          />
        </div>
      </section>

      {/* Source provenance note */}
      {participant.source_values?.arrival_flight && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Last updated from {participant.source_values.arrival_flight.source} on{' '}
          {new Date(participant.source_values.arrival_flight.observed_at).toLocaleDateString()}
        </div>
      )}

      {canWrite && (
        <div className="icplc-actions">
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="icplc-btn">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="icplc-btn icplc-btn-primary">Edit</button>
          )}
        </div>
      )}
    </div>
  )
}

function FlightField({ label, type, field, form, participant, editing, onChange }) {
  return (
    <div>
      <label htmlFor={`icplc-travel-${field}`} className="icplc-label">{label}</label>
      {editing ? (
        <input
          id={`icplc-travel-${field}`}
          type={type}
          value={form[field]}
          onChange={(e) => onChange(e.target.value)}
          className="icplc-input"
        />
      ) : (
        <div style={{ fontSize: 13 }}>{participant[field] || '—'}</div>
      )}
    </div>
  )
}
