import React, { useState } from 'react'
import { AlertTriangle, User, Mail, FileText, Plane, Tag, Pencil } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { attentionReasons } from '../../lib/attentionModel.js'
import { deriveReadiness, readinessTone, readinessLabel, deriveTravelStatus, deriveItineraryStatus } from '../../lib/readinessEngine.js'
import Badge from '../../../../components/ui/Badge.jsx'
import { supabase } from '../../../../lib/supabase.js'
import { useAddTag, useRemoveTag, useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { useAuth } from '../../../../hooks/useAuth.js'
import { makePrimaryPayload, isOwnershipConflict } from '../../lib/reconciliation.js'
import { overrideFieldsForEdit } from '../../lib/fieldAuthority.js'
import { SUBGROUP_OPTIONS } from '../../lib/subgroups.js'
import { deriveDocumentation, effectiveVisaRequirement } from '../../lib/documentationRules.js'
import { groupForSubgroup } from '../../lib/subgroups.js'
import { Card, EditButton, Chip, Row, PILL_TONES } from './tabUi.jsx'
import { DOCUMENT_READINESS_LABELS, DOCUMENT_TYPE_LABELS, RESIDENCY_STATUS_LABELS } from '../../../registration/icplcDocReadiness.js'

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

const cap = (v) => {
  const t = String(v ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

function StatePill({ tone, label, dot }) {
  const p = PILL_TONES[tone] || PILL_TONES.mute
  return (
    <div style={{ background: p.bg, color: p.fg, borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
      {dot && <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />}
      {label}
    </div>
  )
}

const passportTone = (v) => (v === 'ready' ? 'done' : ['unknown', 'unsure'].includes(v) ? 'mute' : v === 'issue' || v === 'no_passport' ? 'blocked' : 'at_risk')
// Visa requirement 'review' + process 'not_started' are the untouched defaults: nobody has assessed a visa
// for this person, so say that in neutral grey instead of an amber "Review — Not started" that reads like a
// visa in progress.
function visaSummary(requirement, process) {
  if (requirement === 'not_required') return { tone: 'done', label: 'Not required' }
  if (requirement === 'review' && process === 'not_started') return { tone: 'mute', label: 'Not assessed' }
  const req = requirement === 'review' ? 'Needs review' : cap(requirement)
  const tone = process === 'approved' ? 'done' : process === 'issue' ? 'blocked' : process === 'not_started' ? 'at_risk' : requirement === 'review' ? 'at_risk' : 'in_progress'
  return { tone, label: `${req} — ${cap(process)}` }
}

export default function OverviewTab({ participant, canWrite }) {
  const { readiness } = deriveReadiness(participant)
  const reasons = attentionReasons(participant) // readiness is untouched by a review; only the reasons staff must act on are listed
  const travelStatus = deriveTravelStatus(participant)
  const itinerary = deriveItineraryStatus(participant)
  const documentation = deriveDocumentation(participant)
  const visa = visaSummary(effectiveVisaRequirement(participant), participant.visa_process_status)
  const canadianLabel = documentation.canadian.attention
    ? 'Not ready'
    : DOCUMENT_READINESS_LABELS[documentation.canadian.readiness] || 'Unknown'
  const [editIdentity, setEditIdentity] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {reasons.length > 0 && (
        <Card icon={AlertTriangle} title="Needs Attention">
          {reasons.map((r) => (
            <div key={r} style={{ background: '#FDF6E7', border: '1px solid #F5E1B8', color: '#7A4A06', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{r}</div>
          ))}
        </Card>
      )}

      <IdentitySection participant={participant} canWrite={canWrite} editing={editIdentity} setEditing={setEditIdentity} />

      <EmailSection participant={participant} canWrite={canWrite} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Card icon={FileText} title="Documentation">
          <Row label="Passport"><Chip tone={passportTone(participant.passport_readiness)} label={cap(participant.passport_readiness)} /></Row>
          <Row label="Visa"><Chip tone={visa.tone} label={visa.label} /></Row>
          <Row label="Canadian status">
            <Chip tone="mute" label={documentation.canadian.status ? (RESIDENCY_STATUS_LABELS[documentation.canadian.status] || cap(documentation.canadian.status)) : 'Not set'} />
          </Row>
          {documentation.canadian.required && (
            <Row label={DOCUMENT_TYPE_LABELS[documentation.canadian.docType] || 'Status document'}>
              <Chip tone={documentation.canadian.readiness === 'READY' ? 'done' : documentation.canadian.readiness ? 'at_risk' : 'mute'} label={canadianLabel} />
            </Row>
          )}
        </Card>
        <Card icon={Plane} title="Travel">
          <Row label="Itinerary"><Chip tone={itinerary === 'received' ? 'done' : 'blocked'} label={itinerary === 'received' ? 'Received' : 'Missing'} /></Row>
          <Row label="Status"><Chip tone={travelStatus === 'ready' ? 'done' : 'at_risk'} label={travelStatus === 'ready' ? 'Ready' : 'Outstanding'} /></Row>
        </Card>
      </div>

      <TagsSection participant={participant} canWrite={canWrite} />
    </div>
  )
}

const IDENTITY_FIELDS = [
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'kingschat_username', label: 'KingsChat Handle' },
  { key: 'region', label: 'Campus / Region' },
  { key: 'subgroup', label: 'Subgroup', options: SUBGROUP_OPTIONS },
  { key: 'gender', label: 'Gender (for rooms)', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] },
  { key: 'group_name', label: 'Group (from subgroup)', derived: true },
  { key: 'leadership', label: 'Leadership' },
  { key: 'notes', label: 'Notes', multiline: true },
]

function IdentitySection({ participant, canWrite, editing, setEditing }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  function loadForm() {
    setForm(Object.fromEntries(IDENTITY_FIELDS.map((f) => [f.key, participant[f.key] || ''])))
    setError(null)
  }

  function startEdit() {
    loadForm()
    setEditing(true)
  }

  // "Assign group" in the Organization card flips `editing` from outside; load the form then.
  React.useEffect(() => {
    if (editing) loadForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  async function save(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Full name is required.'); return }
    const changed = {}
    for (const { key } of IDENTITY_FIELDS) {
      if (IDENTITY_FIELDS.find((f) => f.key === key)?.derived) continue // group follows subgroup (DB trigger)
      const next = form[key].trim() || null
      if (next !== (participant[key] || null)) changed[key] = next
    }
    if (!Object.keys(changed).length) { setEditing(false); return }
    const persist = async (fields) => {
      const overrideFields = overrideFieldsForEdit(Object.keys(fields))
      await updateProfile.mutateAsync({
        id: participant.id,
        fields,
        setOverride: overrideFields.length > 0,
        overrideFields,
        userId: authProfile?.id,
      })
    }
    try {
      await persist(changed)
      setEditing(false)
    } catch (err) {
      // Provision for a database that doesn't have the gender column yet: keep the rest of the edit.
      if ('gender' in changed && /gender/i.test(err.message || '') && /schema cache|column/i.test(err.message || '')) {
        const { gender: _gender, ...rest } = changed
        try {
          if (Object.keys(rest).length) await persist(rest)
          setEditing(false)
          setNotice('Your other changes were saved. Gender could not be saved because this database does not have the gender column yet.')
        } catch (retryErr) {
          setError(retryErr.message || 'Failed to save changes.')
        }
        return
      }
      setError(err.message || 'Failed to save changes.')
    }
  }

  const fieldBox = { marginTop: 4, display: 'block', width: '100%', background: editing ? '#fff' : '#F7F8FA' }
  const fields = IDENTITY_FIELDS.filter((f) => !f.multiline)
  // `select *` returns every column (null included), so a missing key means the column isn't deployed to this database yet.
  const genderColumnMissing = !('gender' in participant)
  const notes = IDENTITY_FIELDS.find((f) => f.multiline)

  return (
    <Card icon={User} title="Personal Information" action={canWrite && !editing ? <EditButton onClick={startEdit} /> : null}>
      <form onSubmit={save}>
        {error && (
          <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 10px' }}>{error}</div>
        )}
        {notice && (
          <div role="status" style={{ marginBottom: 8, fontSize: 12, color: '#7A4A06', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 10px' }}>{notice}</div>
        )}
        <div className="icplc-field-grid">
          {fields.map((f) => {
            const value = editing ? form[f.key] ?? '' : participant[f.key] || ''
            return (
              <label key={f.key} style={{ fontSize: 12, color: 'var(--text-secondary)', gridColumn: ['full_name', 'subgroup'].includes(f.key) ? '1 / -1' : undefined }}>
                {f.label}
                {f.key === 'gender' && genderColumnMissing && (
                  <span style={{ marginLeft: 6, color: '#A15C07' }}>· not stored in this database yet</span>
                )}
                {f.options ? (
                  <select className="icplc-input" style={fieldBox} disabled={!editing} value={value}
                    onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: e.target.value }))}>
                    <option value="">{editing ? '— None —' : '— Not set —'}</option>
                    {(() => {
                      const opts = f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
                      const all = value && !opts.some((o) => o.value === value) ? [{ value, label: value }, ...opts] : opts
                      return all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                    })()}
                  </select>
                ) : (
                  <input className="icplc-input" style={f.derived ? { ...fieldBox, background: '#F7F8FA' } : fieldBox} readOnly={!editing || f.derived} required={f.required}
                    value={f.derived ? (groupForSubgroup(editing ? form.subgroup : participant.subgroup) || value) : value}
                    placeholder={editing ? '' : '— Not set —'}
                    onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: e.target.value }))} />
                )}
              </label>
            )
          })}
        </div>
        {(editing || participant.notes) && (
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 12 }}>
            {notes.label}
            <textarea className="icplc-input" rows={editing ? 4 : 2} style={fieldBox} readOnly={!editing}
              value={editing ? form.notes ?? '' : participant.notes || ''}
              onChange={(e) => setForm((cur) => ({ ...cur, notes: e.target.value }))} />
          </label>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button type="submit" disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
              {updateProfile.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null) }} className="icplc-btn">Cancel</button>
          </div>
        )}
      </form>
    </Card>
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
    <Card icon={Tag} title="Tags">

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {(participant.tags || []).map((t) => (
          <span
            key={t.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 14, fontSize: 12,
              background: 'var(--surface-2, #F3F4F6)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border, #E5E7EB)',
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
          <button
            type="button"
            onClick={() => setShowPicker((p) => !p)}
            aria-expanded={showPicker}
            style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
              background: 'transparent', border: '1px dashed var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {showPicker ? 'Done' : '+ Add tag'}
          </button>
        )}
      </div>

      {/* Inline picker (not a popup) so the drawer's scroll area can't clip it */}
      {canWrite && showPicker && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {unassigned.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={addTag.isPending}
              onClick={() => addTag.mutate({ participantId: participant.id, tagId: t.id, addedBy: profile?.id })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                borderRadius: 14, fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, background: t.color || 'var(--surface-2)' }} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      {(addTag.error || removeTag.error) && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#B42318' }}>
          Couldn't update tags: {(addTag.error || removeTag.error).message}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {canWrite && !hasTags && unassigned.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No tags available. Add some in Settings.</span>
        )}
      </div>
    </Card>
  )
}

function EmailSection({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [editing, setEditing] = useState(null) // null | 'primary' | 'alternate' | 'add_alternate'
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState(null)

  const hasPrimary = !!participant.email
  const hasAlternate = !!participant.alternate_email

  async function saveEmail(field, value) {
    setError(null)
    try {
      await updateProfile.mutateAsync({
        id: participant.id,
        fields: { [field]: value || null },
      })
      setEditing(null)
    } catch (err) {
      if (isOwnershipConflict(err)) {
        setError('This email is already assigned to another participant in this event.')
      } else {
        setError(err.message || 'Failed to update email.')
      }
    }
  }

  async function makePrimary() {
    setError(null)
    try {
      await updateProfile.mutateAsync({
        id: participant.id,
        fields: makePrimaryPayload(participant),
      })
    } catch (err) {
      if (isOwnershipConflict(err)) {
        setError('Email ownership conflict — refresh and try again.')
      } else {
        setError(err.message || 'Failed to swap emails.')
      }
    }
  }

  async function removeAlternate() {
    setError(null)
    try {
      await updateProfile.mutateAsync({ id: participant.id, fields: { alternate_email: null } })
    } catch (err) {
      setError(err.message || 'Failed to remove alternate email.')
    }
  }

  const pending = updateProfile.isPending

  return (
    <Card icon={Mail} title="Contact Information">
      {error && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 10px' }}>
          {error}
        </div>
      )}

      {/* Primary email */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 100 }}>Primary Email</div>
          {editing === 'primary' ? (
            <form onSubmit={(e) => { e.preventDefault(); saveEmail('email', emailInput) }} style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input
                autoFocus
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
              />
              <button type="submit" disabled={pending} className="icplc-btn icplc-btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>Save</button>
              <button type="button" onClick={() => { setEditing(null); setError(null) }} className="icplc-btn" style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span style={{ fontSize: 13, color: hasPrimary ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {participant.email || '—'}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => { setEmailInput(participant.email || ''); setEditing('primary'); setError(null) }}
                  className="icplc-btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alternate email */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 100 }}>Alternate Email</div>
          {editing === 'alternate' || editing === 'add_alternate' ? (
            <form onSubmit={(e) => { e.preventDefault(); saveEmail('alternate_email', emailInput) }} style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input
                autoFocus
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="alternate@example.com"
                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
              />
              <button type="submit" disabled={pending} className="icplc-btn icplc-btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>Save</button>
              <button type="button" onClick={() => { setEditing(null); setError(null) }} className="icplc-btn" style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: hasAlternate ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {participant.alternate_email || '—'}
              </span>
              {canWrite && !hasAlternate && (
                <button
                  type="button"
                  onClick={() => { setEmailInput(''); setEditing('add_alternate'); setError(null) }}
                  className="icplc-btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  + Add
                </button>
              )}
              {canWrite && hasAlternate && (
                <>
                  <button
                    type="button"
                    onClick={() => { setEmailInput(participant.alternate_email || ''); setEditing('alternate'); setError(null) }}
                    className="icplc-btn"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={removeAlternate}
                    disabled={pending}
                    className="icplc-btn"
                    style={{ fontSize: 11, padding: '2px 8px', color: '#991B1B' }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={makePrimary}
                    disabled={pending}
                    className="icplc-btn"
                    style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600 }}
                    title="Swap primary and alternate — provenance travels with the values"
                  >
                    Make Primary
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
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
