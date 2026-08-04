import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const C = {
  purple: '#4C2A92',
  line: '#E7E2EE',
  mute: '#8A7F99',
  red: '#C4383A',
  paper: '#FFFFFF',
  ink: '#1A1220',
};


export default function RegistrationEditModal({ registration, onClose, onSave }) {
  const [formData, setFormData] = useState({
    firstName: registration.firstName || '',
    lastName: registration.lastName || '',
    phone: registration.phone || '',
    gender: registration.gender || '',
    subgroup: registration.subgroup || '',
    fellowship: registration.fellowship || '',
    team: registration.team || '',
    designation: registration.designation || '',
    shirtSize: registration.shirtSize || '',
    foundationStatus: registration.foundationStatus || '',
    baptism: registration.baptism || '',
    allergies: registration.allergies || '',
    leadership: registration.leadership || '',
    arrivalDate: registration.arrivalDate || '',
    arrivalTime: registration.arrivalTime || '',
    arrivalFlight: registration.arrivalFlight || '',
    departureDate: registration.departureDate || '',
    departureTime: registration.departureTime || '',
    departureFlight: registration.departureFlight || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ')
        || registration.fullName || '';

      const dbPayload = {
        first_name: formData.firstName || null,
        last_name: formData.lastName || null,
        full_name: fullName || null,
        phone: formData.phone || null,
        gender: formData.gender || null,
        subgroup: formData.subgroup,
        fellowship: formData.fellowship,
        team: formData.team,
        designation: formData.designation,
        shirt_size: formData.shirtSize,
        foundation_status: formData.foundationStatus,
        baptism: formData.baptism,
        allergies: formData.allergies,
        leadership: formData.leadership,
        arrival_date: formData.arrivalDate || null,
        arrival_time: formData.arrivalTime || null,
        arrival_flight: formData.arrivalFlight || null,
        departure_date: formData.departureDate || null,
        departure_time: formData.departureTime || null,
        departure_flight: formData.departureFlight || null,
      };

      let updateError;
      if (registration.id) {
        ({ error: updateError } = await supabase
          .from('registrations')
          .update(dbPayload)
          .eq('id', registration.id));
      } else if (registration.email) {
        ({ error: updateError } = await supabase
          .from('registrations')
          .update(dbPayload)
          .eq('email', registration.email));
      }

      if (updateError) throw updateError;

      onSave?.({ ...registration, ...formData, fullName });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.paper,
          borderRadius: 12,
          width: '90%',
          maxWidth: 700,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${C.line}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
              Edit Registration
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
              {registration.fullName || `${registration.firstName} ${registration.lastName}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: C.mute,
              padding: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div style={{ overflowY: 'auto', padding: '24px', flex: 1 }}>
          {error && (
            <div
              style={{
                background: '#FBE9E9',
                border: `1px solid ${C.red}`,
                color: C.red,
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Personal details */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Personal Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="First Name" value={formData.firstName} onChange={(v) => handleChange('firstName', v)} />
              <FormField label="Last Name" value={formData.lastName} onChange={(v) => handleChange('lastName', v)} />
              <FormField label="Phone" value={formData.phone} onChange={(v) => handleChange('phone', v)} />
              <FormField label="Gender" value={formData.gender} onChange={(v) => handleChange('gender', v)} type="select" options={['', 'Male', 'Female', 'Other']} />
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 4, textTransform: 'uppercase' }}>Email</label>
                <div style={{ padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 13, color: C.mute, background: '#FAFAFA' }}>
                  {registration.email || '—'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Registration Info</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Subgroup" value={formData.subgroup} onChange={(v) => handleChange('subgroup', v)} />
            <FormField label="Team" value={formData.team} onChange={(v) => handleChange('team', v)} />
            <FormField label="Fellowship" value={formData.fellowship} onChange={(v) => handleChange('fellowship', v)} />
            <FormField label="Designation" value={formData.designation} onChange={(v) => handleChange('designation', v)} />
            <FormField label="Shirt Size" value={formData.shirtSize} onChange={(v) => handleChange('shirtSize', v)} />
            <FormField label="Foundation Status" value={formData.foundationStatus} onChange={(v) => handleChange('foundationStatus', v)} />
            <FormField label="Baptism" value={formData.baptism} onChange={(v) => handleChange('baptism', v)} />
            <FormField label="Leadership" value={formData.leadership} onChange={(v) => handleChange('leadership', v)} />

            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Allergies/Diet" value={formData.allergies} onChange={(v) => handleChange('allergies', v)} multiline />
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.line}`, paddingTop: 16, marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Flights</div>
            </div>

            <FormField label="Arrival Date" type="date" value={formData.arrivalDate} onChange={(v) => handleChange('arrivalDate', v)} />
            <FormField label="Arrival Time" type="time" value={formData.arrivalTime} onChange={(v) => handleChange('arrivalTime', v)} />
            <FormField label="Arrival Flight" value={formData.arrivalFlight} onChange={(v) => handleChange('arrivalFlight', v)} />
            <FormField label="Departure Date" type="date" value={formData.departureDate} onChange={(v) => handleChange('departureDate', v)} />
            <FormField label="Departure Time" type="time" value={formData.departureTime} onChange={(v) => handleChange('departureTime', v)} />
            <FormField label="Departure Flight" value={formData.departureFlight} onChange={(v) => handleChange('departureFlight', v)} />

          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${C.line}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${C.line}`,
              background: C.paper,
              color: C.ink,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: saving ? '#CCC' : C.purple,
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', multiline = false, options }) {
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${C.line}`,
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'Inter',
    color: C.ink,
    boxSizing: 'border-box',
    background: '#fff',
  };
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, minHeight: 60 }}
        />
      ) : type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {(options || []).map((o) => (
            <option key={o} value={o}>{o || '— select —'}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}
