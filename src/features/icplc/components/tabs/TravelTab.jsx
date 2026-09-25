import React, { useState } from 'react'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../../lib/readinessEngine.js'
import Badge from '../../../../components/ui/Badge.jsx'

export default function TravelTab({ participant, canWrite }) {
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
      if (val !== cur) changed[key] = val || undefined
    }
    if (Object.keys(changed).length === 0) { setEditing(false); return }
    await updateProfile.mutateAsync({ id: participant.id, fields: changed })
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Derived status chips */}
      <div style={{ display: 'flex', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateProfile.isPending}
                style={primaryBtn}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={ghostBtn}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={primaryBtn}>Edit</button>
          )}
        </div>
      )}
    </div>
  )
}

function FlightField({ label, type, field, form, participant, editing, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {editing ? (
        <input
          type={type}
          value={form[field]}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      ) : (
        <div style={{ fontSize: 13 }}>{participant[field] || '—'}</div>
      )}
    </div>
  )
}

const inputStyle = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
}
const primaryBtn = {
  padding: '6px 14px', background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const ghostBtn = {
  padding: '6px 14px', background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
