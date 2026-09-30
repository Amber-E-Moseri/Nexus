import React, { useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { overrideFieldsForEdit } from '../../lib/fieldAuthority.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../../lib/readinessEngine.js'
import { Plane, PlaneTakeoff, PlaneLanding, MapPin as NoFlightIcon } from 'lucide-react'
import { FLIGHT_NOT_REQUIRED_REASONS, flightNotRequired, flightNotRequiredInfo } from '../../lib/flightRequirement.js'
import { useUserName } from '../../hooks/useUserName.js'
import { Card, EditButton, Chip, Row } from './tabUi.jsx'

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
  const notRequired = flightNotRequired(participant)
  const exception = flightNotRequiredInfo(participant)
  const setBy = useUserName(exception?.by)
  const [exceptionForm, setExceptionForm] = useState(null) // { reason, note } while editing

  // Recorded as an exception with who and when; no itinerary or flight record is created. The audit trail keeps the history.
  async function saveException(next) {
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: next
        ? {
            flight_not_required_reason: next.reason,
            flight_not_required_note: next.note.trim() || null,
            flight_not_required_by: authProfile?.id ?? null,
            flight_not_required_at: new Date().toISOString(),
          }
        : { flight_not_required_reason: null, flight_not_required_note: null, flight_not_required_by: null, flight_not_required_at: null },
    })
    setExceptionForm(null)
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card icon={Plane} title="Travel Status" action={canWrite && !editing ? <EditButton onClick={() => setEditing(true)} /> : null}>
        <Row label="Itinerary">
          {notRequired
            ? <Chip tone="mute" label="Not required" />
            : <Chip tone={itineraryStatus === 'received' ? 'done' : 'blocked'} label={itineraryStatus === 'received' ? 'Received' : 'Missing'} />}
        </Row>
        <Row label="Status"><Chip tone={travelStatus === 'ready' ? 'done' : 'at_risk'} label={travelStatus === 'ready' ? 'Ready' : 'Outstanding'} /></Row>
      </Card>

      {/* Flight requirement: an exception for people who need no ICPLC flight (for example already in Nigeria) */}
      <Card icon={NoFlightIcon} title="Flight requirement">
        {exception && !exception.superseded && exceptionForm === null ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div><strong>Flight not required</strong></div>
            <div>Reason: {exception.label}</div>
            {exception.note && <div>Note: {exception.note}</div>}
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              Set{setBy ? ` by ${setBy}` : ''}{exception.at ? ` on ${new Date(exception.at).toLocaleDateString()}` : ''}
            </div>
            {canWrite && (
              <div className="icplc-actions">
                <button type="button" className="icplc-btn" onClick={() => setExceptionForm({ reason: exception.reason, note: exception.note || '' })}>Change</button>
                <button type="button" className="icplc-btn" disabled={updateProfile.isPending} onClick={() => saveException(null)}>A flight is needed after all</button>
              </div>
            )}
          </div>
        ) : exceptionForm ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="icplc-label" htmlFor="fnr-reason">Reason</label>
            <select id="fnr-reason" className="icplc-input" value={exceptionForm.reason} onChange={(e) => setExceptionForm((f) => ({ ...f, reason: e.target.value }))}>
              {FLIGHT_NOT_REQUIRED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <label className="icplc-label" htmlFor="fnr-note">Note (optional)</label>
            <input id="fnr-note" className="icplc-input" value={exceptionForm.note} onChange={(e) => setExceptionForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Attending another conference first" />
            <div className="icplc-actions">
              <button type="button" className="icplc-btn icplc-btn-primary" disabled={updateProfile.isPending} onClick={() => saveException(exceptionForm)}>Save</button>
              <button type="button" className="icplc-btn" onClick={() => setExceptionForm(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <div>{exception?.superseded ? 'A flight was submitted, so the normal flight workflow applies.' : 'A flight is expected.'}</div>
            {canWrite && (
              <div className="icplc-actions">
                <button type="button" className="icplc-btn" onClick={() => setExceptionForm({ reason: FLIGHT_NOT_REQUIRED_REASONS[0].value, note: '' })}>Mark flight not required</button>
              </div>
            )}
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          This never waives registration, and no itinerary is created.
        </p>
      </Card>

      {/* Arrival */}
      <Card icon={PlaneLanding} title="Arrival">
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
      </Card>

      {/* Departure */}
      <Card icon={PlaneTakeoff} title="Departure">
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
      </Card>

      {/* Source provenance note */}
      {participant.source_values?.arrival_flight && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Last updated from {participant.source_values.arrival_flight.source} on{' '}
          {new Date(participant.source_values.arrival_flight.observed_at).toLocaleDateString()}
        </div>
      )}

      {canWrite && editing && (
        <div className="icplc-actions">
          <button type="button" onClick={handleSave} disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="icplc-btn">Cancel</button>
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
