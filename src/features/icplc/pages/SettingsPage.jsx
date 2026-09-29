import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase.js'
import { useICPLC } from '../ICPLCContext.jsx'
import EventSettings from '../../registration/SettingsTab.jsx'

export default function SettingsPage({ onConfigReload }) {
  const { config } = useICPLC()

  return (
    <div style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <DeadlinesSection eventId={config?.id} />
      <TagsSection eventId={config?.id} />
      <VisaDefaultsSection eventId={config?.id} />
      <IntegrationsSection eventId={config?.id} />
      {config?.id && <EventSettings config={config} onSaved={async () => { await onConfigReload?.() }} />}
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

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ name: '', color: '#6366F1' })
  const startEdit = (t) => {
    setDraft({ name: t.name, color: t.color || '#6366F1' })
    setEditingId(t.id)
  }

  // Rename / recolour. Names are unique per event, so a clash surfaces as an error on the row.
  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }) => {
      const { error } = await supabase.from('icplc_tags').update({ name: name.trim(), color }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['icplc_tags'] })
      // Participants carry their tags inline; refresh so renames/colours show everywhere.
      qc.invalidateQueries({ queryKey: ['icplc_participants'] })
      qc.invalidateQueries({ queryKey: ['icplc_profile'] })
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
            editingId === t.id ? (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: 'var(--surface-2)', borderRadius: 6, fontSize: 13, flexWrap: 'wrap',
              }}>
                <input
                  type="color"
                  aria-label={`Colour for ${t.name}`}
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  style={{ width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 4, padding: 2, cursor: 'pointer' }}
                />
                <input
                  autoFocus
                  aria-label={`Name for ${t.name}`}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.name.trim()) updateTag.mutate({ id: t.id, ...draft })
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                />
                <button
                  onClick={() => updateTag.mutate({ id: t.id, ...draft })}
                  disabled={!draft.name.trim() || updateTag.isPending}
                  style={primaryBtn}
                >
                  {updateTag.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </button>
                {updateTag.isError && (
                  <div role="alert" style={{ flexBasis: '100%', fontSize: 12, color: '#991B1B' }}>
                    Could not save: {updateTag.error?.message}
                  </div>
                )}
              </div>
            ) : (
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
                <button
                  onClick={() => startEdit(t)}
                  aria-label={`Edit ${t.name}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}
                >
                  Edit
                </button>
                {t.event_id !== null && (
                  <button
                    onClick={() => deleteTag.mutate(t.id)}
                    aria-label={`Delete ${t.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
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
          disabled={!newName.trim() || addTag.isPending}
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
          disabled={!country.trim() || upsertDefault.isPending}
          style={primaryBtn}
        >
          Save
        </button>
      </div>
    </section>
  )
}

/* ── Deadlines ── */

const DEADLINE_FIELDS = [
  { key: 'registration_deadline', label: 'Registration Deadline', description: 'Last date to accept new registrations' },
  { key: 'visa_target_date', label: 'Visa Target Date', description: 'Target date for all visa applications to be submitted' },
  { key: 'flight_booking_deadline', label: 'Flight Booking Deadline', description: 'Last date to book flights' },
]

function DeadlinesSection({ eventId }) {
  const qc = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['icplc_event_config_deadlines', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_configs')
        .select('id, tab_config')
        .eq('id', eventId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!eventId,
  })

  const deadlines = config?.tab_config?.icplc_deadlines || {}

  const saveDeadline = useMutation({
    mutationFn: async ({ key, value }) => {
      const updated = { ...deadlines, [key]: value || null }
      const { error } = await supabase
        .from('event_configs')
        .update({ tab_config: { ...(config?.tab_config || {}), icplc_deadlines: updated } })
        .eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['icplc_event_config_deadlines', eventId]),
  })

  if (isLoading) return null

  return (
    <section>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Deadlines</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Key operational dates for this event. Staff-visible only.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {DEADLINE_FIELDS.map(({ key, label, description }) => (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</div>
            </div>
            <input
              type="date"
              defaultValue={deadlines[key] || ''}
              onBlur={(e) => {
                const val = e.target.value
                if (val !== (deadlines[key] || '')) saveDeadline.mutate({ key, value: val })
              }}
              style={{ ...inputStyle, width: 140 }}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Integrations ── */

function IntegrationsSection({ eventId }) {
  const { data: lastBatch, isLoading } = useQuery({
    queryKey: ['icplc_last_import_batch', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_import_batches')
        .select('id, created_at, row_count, source_label, status')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!eventId,
    staleTime: 30_000,
  })

  const fmt = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    } catch { return iso }
  }

  return (
    <section>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Integrations</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Status of connected data sources.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <IntegrationRow
          label="CSV Import"
          status={isLoading ? 'loading' : lastBatch ? lastBatch.status || 'ok' : 'never'}
          detail={isLoading ? 'Checking…' : lastBatch
            ? `Last import: ${fmt(lastBatch.created_at)} · ${lastBatch.row_count ?? '?'} rows · ${lastBatch.source_label || 'CSV'}`
            : 'No import runs yet'}
        />
        <IntegrationRow
          label="CMP Documentation Sync"
          status="beta"
          detail="BETA — discovery and mapping engine ready; Sync/Apply requires DB certification. Configure in the Imports tab."
        />
        <IntegrationRow
          label="Registration Form"
          status="ok"
          detail="Live — participants link automatically on form submission."
        />
      </div>
    </section>
  )
}

function IntegrationRow({ label, status, detail }) {
  const dot = {
    ok: { color: '#2D8653', label: 'Active' },
    loading: { color: '#C97820', label: 'Checking' },
    never: { color: '#9CA3AF', label: 'No data' },
    not_configured: { color: '#9CA3AF', label: 'Not configured' },
    beta: { color: '#2563EB', label: 'Beta' },
    error: { color: '#C94830', label: 'Error' },
  }[status] || { color: '#9CA3AF', label: status }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{detail}</div>
      </div>
      <span style={{ fontSize: 11, color: dot.color, fontWeight: 600 }}>{dot.label}</span>
    </div>
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
