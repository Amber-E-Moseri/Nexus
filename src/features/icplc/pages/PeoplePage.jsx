import React, { useMemo, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { useCreateParticipant, useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantTable from '../components/ParticipantTable.jsx'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { POOL_SOURCE_TYPE, poolSourceKey } from '../lib/reconciliation.js'

export default function PeoplePage({ canWrite }) {
  const { config, filters, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const [showAdd, setShowAdd] = useState(false)
  const [showPool, setShowPool] = useState(false)

  const { data: participants, isLoading, error } = useICPLCParticipants(eventId, {
    search: filters.search,
    participation_status: filters.participation_status,
    registration_status: filters.registration_status,
    passport_readiness: filters.passport_readiness,
    visa_requirement: filters.visa_requirement,
    visa_process_status: filters.visa_process_status,
    subgroup: filters.subgroup,
  })

  return (
    <div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={() => setShowAdd(true)} style={primaryBtn}><UserPlus size={14} /> Add Person</button>
          <button onClick={() => setShowPool(true)} style={ghostBtn}><Users size={14} /> Add from Pool</button>
        </div>
      )}

      {/* Search bar */}
      <div style={{ marginBottom: 12 }}>
        <SearchBar />
      </div>

      {/* Filters */}
      <ParticipantFilters />

      {/* Count */}
      {!isLoading && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {participants?.length ?? 0} participant{participants?.length !== 1 ? 's' : ''}
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
          Failed to load participants.
        </div>
      )}

      <ParticipantTable participants={participants} loading={isLoading} />

      {/* Canonical profile drawer */}
      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}

      {showAdd && (
        <AddPersonModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onCreated={(participant) => {
            setShowAdd(false)
            openProfile(participant.id)
          }}
        />
      )}

      {showPool && (
        <PoolCopyModal
          eventId={eventId}
          participants={participants || []}
          onClose={() => setShowPool(false)}
          onCopied={(participant) => openProfile(participant.id)}
        />
      )}
    </div>
  )
}

function SearchBar() {
  const { filters, setFilters } = useICPLC()
  return (
    <input
      type="search"
      placeholder="Search by name or email…"
      value={filters.search}
      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
      style={{
        padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6,
        fontSize: 13, width: 280, outline: 'none',
      }}
    />
  )
}

function AddPersonModal({ eventId, onClose, onCreated }) {
  const createParticipant = useCreateParticipant(eventId)
  const [form, setForm] = useState({ full_name: '', email: '', region: '', subgroup: '' })
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function submit() {
    if (!form.full_name.trim()) return
    const participant = await createParticipant.mutateAsync({
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      region: form.region.trim() || null,
      subgroup: form.subgroup.trim() || null,
      registration_status: 'not_registered',
      source_values: {
        created_from: {
          source: 'nexus_manual',
          observed_at: new Date().toISOString(),
        },
      },
    })
    onCreated(participant)
  }

  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Add ICPLC Person</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Full name" value={form.full_name} onChange={set('full_name')} autoFocus />
          <Field label="Email" value={form.email} onChange={set('email')} />
          <Field label="Region" value={form.region} onChange={set('region')} />
          <Field label="Subgroup" value={form.subgroup} onChange={set('subgroup')} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={ghostButtonStyle}>Cancel</button>
          <button onClick={submit} disabled={!form.full_name.trim() || createParticipant.isPending} style={primaryButtonStyle}>
            {createParticipant.isPending ? 'Saving...' : 'Create participant'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PoolCopyModal({ eventId, participants, onClose, onCopied }) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [poolRows, setPoolRows] = useState([])
  const [loading, setLoading] = useState(false)

  async function searchPool(q) {
    setLoading(true)
    setError(null)
    try {
      let req = supabase
        .from('mi_members')
        .select('id, cmp_id, name, phone, email, subgroup_id, fellowship_id, mi_subgroups(name), mi_fellowships(name)')
        .eq('is_active', true)
        .order('name')
        .limit(50)
      if (q.trim()) {
        req = req.or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
      }
      const { data, error: poolError } = await req
      if (poolError) throw poolError
      setPoolRows(data || [])
    } catch (err) {
      setError(err.message || 'Could not load pool.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    searchPool('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const existingEmails = useMemo(
    () => new Set(participants.map((p) => String(p.email || '').toLowerCase()).filter(Boolean)),
    [participants],
  )

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function copySelected() {
    setSaving(true)
    setError(null)
    try {
      let lastCreated = null
      for (const person of poolRows.filter((p) => selected.has(p.id))) {
        const key = poolSourceKey(person)
        if (!key) continue

        const { data: existingMap, error: mapLookupError } = await supabase
          .from('icplc_identity_maps')
          .select('participant_id')
          .eq('event_id', eventId)
          .eq('source_type', POOL_SOURCE_TYPE)
          .eq('source_key', key)
          .maybeSingle()
        if (mapLookupError) throw mapLookupError
        if (existingMap?.participant_id) continue

        const { data: participant, error: createError } = await supabase
          .from('icplc_participants')
          .insert({
            event_id: eventId,
            full_name: person.name,
            email: person.email || null,
            subgroup: person.mi_subgroups?.name || null,
            registration_status: 'not_registered',
            source_values: {
              pool_source: {
                source: POOL_SOURCE_TYPE,
                mi_member_id: person.id,
                cmp_id: person.cmp_id,
                observed_at: new Date().toISOString(),
              },
            },
          })
          .select()
          .single()
        if (createError) throw createError

        const { error: identityError } = await supabase
          .from('icplc_identity_maps')
          .insert({
            event_id: eventId,
            source_type: POOL_SOURCE_TYPE,
            source_key: key,
            participant_id: participant.id,
          })
        if (identityError) throw identityError
        lastCreated = participant
      }
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      setSelected(new Set())
      if (lastCreated) onCopied(lastCreated)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not copy selected people.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalCard, width: 'min(760px, 96vw)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Add from Pool</h3>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Copies active CMP member records into ICPLC. Future pool changes will not sync automatically.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchPool(query)}
            placeholder="Search pool by name, email, or phone..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => searchPool(query)} style={ghostButtonStyle}>Search</button>
        </div>
        {error && <div style={{ color: '#991B1B', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: 360 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyleSmall}></th>
                <th style={thStyleSmall}>Person</th>
                <th style={thStyleSmall}>Subgroup</th>
                <th style={thStyleSmall}>Status</th>
              </tr>
            </thead>
            <tbody>
              {poolRows.map((person) => {
                const duplicate = person.email && existingEmails.has(String(person.email).toLowerCase())
                return (
                  <tr key={person.id}>
                    <td style={tdStyleSmall}>
                      <input
                        type="checkbox"
                        checked={selected.has(person.id)}
                        disabled={duplicate}
                        onChange={() => toggle(person.id)}
                      />
                    </td>
                    <td style={tdStyleSmall}>
                      <div style={{ fontWeight: 600 }}>{person.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{person.email || person.phone || 'No contact'}</div>
                    </td>
                    <td style={tdStyleSmall}>{person.mi_subgroups?.name || '-'}</td>
                    <td style={tdStyleSmall}>{duplicate ? 'Already in ICPLC by email' : 'Available'}</td>
                  </tr>
                )
              })}
              {!loading && poolRows.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyleSmall, color: 'var(--text-secondary)' }}>No pool records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={ghostButtonStyle}>Cancel</button>
          <button onClick={copySelected} disabled={selected.size === 0 || saving} style={primaryButtonStyle}>
            {saving ? 'Copying...' : `Copy ${selected.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, autoFocus }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
      {label}
      <input value={value} onChange={onChange} autoFocus={autoFocus} style={{ ...inputStyle, marginTop: 4 }} />
    </label>
  )
}

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  border: 'none',
  borderRadius: 6,
  background: 'var(--accent)',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
}
const ghostBtn = { ...primaryBtn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)' }
const modalOverlay = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 20 }
const modalCard = { width: 'min(520px, 96vw)', background: 'var(--surface-1)', borderRadius: 8, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }
const primaryButtonStyle = { padding: '7px 14px', border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white', cursor: 'pointer', fontSize: 13 }
const ghostButtonStyle = { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }
const thStyleSmall = { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }
const tdStyleSmall = { padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 }
