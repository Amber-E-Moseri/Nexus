import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase.js'
import { useICPLC } from '../ICPLCContext.jsx'

export default function SettingsPage() {
  const { config } = useICPLC()

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <TagsSection eventId={config?.id} />
      <VisaDefaultsSection eventId={config?.id} />
    </div>
  )
}

/* ── Tags ── */

function TagsSection({ eventId }) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')

  const { data: tags, isLoading } = useQuery({
    queryKey: ['icplc_tags', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_tags')
        .select('*')
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!eventId,
  })

  const addTag = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) return
      const { error } = await supabase.from('icplc_tags').insert({
        event_id: eventId,
        name: newName.trim(),
        color: newColor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['icplc_tags', eventId])
      setNewName('')
    },
  })

  const deleteTag = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('icplc_tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['icplc_tags', eventId]),
  })

  return (
    <section>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Operational Tags</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Tags are used to flag operational situations on a participant's profile. Org-wide tags appear here; event-specific tags are scoped to this event.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(tags || []).map((t) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                background: t.color || 'var(--accent)',
              }} />
              <span style={{ flex: 1 }}>{t.name}</span>
              {t.event_id === null && (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>org</span>
              )}
              {t.event_id !== null && (
                <button
                  onClick={() => deleteTag.mutate(t.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add tag form */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag name"
          style={inputStyle}
          onKeyDown={(e) => e.key === 'Enter' && addTag.mutate()}
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 4, padding: 2, cursor: 'pointer' }}
        />
        <button
          onClick={() => addTag.mutate()}
          disabled={!newName.trim() || addTag.isLoading}
          style={primaryBtn}
        >
          Add
        </button>
      </div>
    </section>
  )
}

/* ── Visa Defaults ── */

function VisaDefaultsSection({ eventId }) {
  const qc = useQueryClient()
  const [country, setCountry] = useState('')
  const [requirement, setRequirement] = useState('review')

  const { data: defaults, isLoading } = useQuery({
    queryKey: ['icplc_visa_defaults', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_visa_defaults')
        .select('*')
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order('passport_country')
      if (error) throw error
      return data
    },
    enabled: !!eventId,
  })

  const upsertDefault = useMutation({
    mutationFn: async () => {
      if (!country.trim()) return
      const { error } = await supabase.from('icplc_visa_defaults').upsert({
        event_id: eventId,
        passport_country: country.trim().toUpperCase(),
        visa_requirement: requirement,
      }, { onConflict: 'event_id,passport_country' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['icplc_visa_defaults', eventId])
      setCountry('')
    },
  })

  const deleteDefault = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('icplc_visa_defaults').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['icplc_visa_defaults', eventId]),
  })

  const VISA_TONES = { required: '#991B1B', not_required: '#166534', review: '#92400E' }

  return (
    <section>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Visa Defaults by Passport Country</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Configure default visa requirements by passport country. These are defaults only — individual participant records can override. Leave table empty for "Review" on all countries.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
      ) : defaults?.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>No country defaults configured.</div>
      ) : (
        <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>Country</th>
              <th style={thStyle}>Visa Requirement</th>
              <th style={thStyle}>Scope</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {(defaults || []).map((d) => (
              <tr key={d.id}>
                <td style={tdStyle}>{d.passport_country}</td>
                <td style={tdStyle}>
                  <span style={{ color: VISA_TONES[d.visa_requirement] || 'inherit', fontWeight: 500 }}>
                    {d.visa_requirement}
                  </span>
                </td>
                <td style={tdStyle}>{d.event_id ? 'event' : 'org'}</td>
                <td style={tdStyle}>
                  {d.event_id && (
                    <button
                      onClick={() => deleteDefault.mutate(d.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country code (e.g. NG)"
          style={{ ...inputStyle, width: 160 }}
          onKeyDown={(e) => e.key === 'Enter' && upsertDefault.mutate()}
        />
        <select
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          style={inputStyle}
        >
          <option value="review">Review</option>
          <option value="required">Required</option>
          <option value="not_required">Not Required</option>
        </select>
        <button
          onClick={() => upsertDefault.mutate()}
          disabled={!country.trim() || upsertDefault.isLoading}
          style={primaryBtn}
        >
          Save
        </button>
      </div>
    </section>
  )
}

const inputStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface-1)',
}
const primaryBtn = {
  padding: '6px 14px', background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
