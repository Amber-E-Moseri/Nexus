import React, { useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Mail } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isProgramsMember } from '../../../lib/permissions.js'
import { SUBGROUP_OPTIONS } from '../lib/subgroups.js'
import { deriveFlightStatus } from '../lib/readinessEngine.js'

// Mass email for ICPLC participants. Sends through the icplc-send-email edge function, which
// re-checks the caller and loads addresses itself from the participant IDs sent here.

// Mirrors the allow-list in supabase/functions/icplc-send-email/index.ts:
// admins, Programs department, and Pastor Chi Nwokem (cedochie@gmail.com).
const NAMED_EDITOR_USER_IDS = ['4c70ca61-443b-4a64-87aa-3453c9dd5c65']

export function canSendICPLCEmail(profile) {
  if (!profile) return false
  return profile.role === 'super_admin'
    || profile.role === 'regional_secretary'
    || isProgramsMember(profile)
    || NAMED_EDITOR_USER_IDS.includes(profile.id)
}

const MERGE_TAGS = [
  { tag: '{{first_name}}', label: 'First name' },
  { tag: '{{name}}', label: 'Full name' },
  { tag: '{{subgroup}}', label: 'Subgroup' },
]

const REGISTRATION = [
  { value: 'registered', label: 'Registered' },
  { value: 'not_registered', label: 'Not registered' },
]
const DOCUMENTATION = [
  { value: 'unknown', label: 'Not provided' },
  { value: 'ready', label: 'Passport ready' },
  { value: 'renewal_needed', label: 'Renewal needed' },
  { value: 'renewal_in_progress', label: 'Renewal in progress' },
  { value: 'no_passport', label: 'No passport' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'issue', label: 'Issue' },
]
const TRAVEL = [
  { value: 'booked', label: 'Flights booked' },
  { value: 'awaiting', label: 'Awaiting' },
  { value: 'missing', label: 'Flights missing' },
]

const label = { fontSize: 11, fontWeight: 700, color: 'var(--icplc-text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }

function personalize(text, p) {
  const name = p.full_name || ''
  const vars = { name, first_name: name.split(/\s+/)[0] || '', subgroup: p.subgroup || '', email: p.email || '' }
  return text.replace(/\{\{\s*(name|first_name|subgroup|email)\s*\}\}/gi, (_m, k) => vars[k.toLowerCase()] ?? '')
}

function ChipGroup({ title, options, selected, onToggle, counts }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={label}>{title}{selected.length === 0 ? ' · all' : ''}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className="icplc-btn"
              style={{
                minHeight: 28, padding: '3px 10px', fontSize: 12, borderRadius: 16,
                borderColor: on ? 'var(--icplc-purple)' : 'var(--icplc-border)',
                background: on ? 'var(--icplc-purple-bg)' : 'var(--icplc-surface)',
                color: on ? 'var(--icplc-purple)' : 'var(--icplc-text)',
                fontWeight: on ? 600 : 400,
              }}
            >
              {o.label}{counts ? ` (${counts[o.value] ?? 0})` : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ICPLCEmailComposer({ eventId, participants, onClose }) {
  const [step, setStep] = useState('compose') // compose | confirm | done
  const [registration, setRegistration] = useState([])
  const [documentation, setDocumentation] = useState([])
  const [subgroups, setSubgroups] = useState([])
  const [travel, setTravel] = useState([])
  const [includeNotAttending, setIncludeNotAttending] = useState(false)
  const [excluded, setExcluded] = useState(() => new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testNote, setTestNote] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const bodyRef = useRef(null)

  const toggle = (setter) => (value) => setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  const base = useMemo(
    () => participants.filter((p) => includeNotAttending || p.participation_status !== 'not_attending'),
    [participants, includeNotAttending],
  )

  const counts = useMemo(() => {
    const tally = (fn) => base.reduce((acc, p) => { const k = fn(p); acc[k] = (acc[k] || 0) + 1; return acc }, {})
    return {
      registration: tally((p) => p.registration_link_status || 'not_registered'),
      documentation: tally((p) => p.passport_readiness || 'unknown'),
      subgroup: tally((p) => p.subgroup || ''),
      travel: tally((p) => deriveFlightStatus(p)),
    }
  }, [base])

  const matched = useMemo(() => base.filter((p) => {
    if (registration.length && !registration.includes(p.registration_link_status || 'not_registered')) return false
    if (documentation.length && !documentation.includes(p.passport_readiness || 'unknown')) return false
    if (subgroups.length && !subgroups.includes(p.subgroup)) return false
    if (travel.length && !travel.includes(deriveFlightStatus(p))) return false
    return true
  }), [base, registration, documentation, subgroups, travel])

  const withEmail = useMemo(() => matched.filter((p) => p.email && p.email.includes('@')), [matched])
  const noEmailCount = matched.length - withEmail.length
  const recipients = useMemo(() => withEmail.filter((p) => !excluded.has(p.id)), [withEmail, excluded])
  const sample = recipients[0] || { full_name: 'Sample Person', subgroup: 'BLW Central Subgroup A', email: 'sample@example.com' }

  const subgroupOptions = useMemo(() => {
    const seen = new Set([...SUBGROUP_OPTIONS, ...participants.map((p) => p.subgroup).filter(Boolean)])
    return [...seen].sort().map((s) => ({ value: s, label: s.replace(/^BLW /, '') }))
  }, [participants])

  function insertTag(tag) {
    const ta = bodyRef.current
    if (!ta) { setBody((prev) => prev + tag); return }
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    setBody(body.slice(0, start) + tag + body.slice(end))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + tag.length }, 0)
  }

  async function invoke(payload) {
    const { data, error: invokeErr } = await supabase.functions.invoke('icplc-send-email', { body: payload })
    if (invokeErr) {
      let message = invokeErr.message
      try { const j = await invokeErr.context?.json?.(); if (j?.error) message = j.error } catch { /* keep default */ }
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function sendTest() {
    setTesting(true); setTestNote(null); setError(null)
    try {
      const data = await invoke({ event_id: eventId, subject, body, test: true })
      setTestNote(data.failed ? 'Test failed to send.' : 'Test sent to your own email address.')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setTesting(false)
    }
  }

  async function send() {
    setSending(true); setError(null)
    try {
      const data = await invoke({ event_id: eventId, participant_ids: recipients.map((p) => p.id), subject, body })
      setResult(data)
      setStep('done')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSending(false)
    }
  }

  const canContinue = recipients.length > 0 && subject.trim() && body.trim()

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !sending) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)' }} />
        <Dialog.Content className="icplc-dialog" aria-describedby={undefined} style={{ width: 'min(720px, calc(100vw - 24px))' }}>
          <Dialog.Title style={{ margin: '0 0 14px', fontSize: 16 }}>
            {step === 'done' ? 'Email sent' : 'Email participants'}
          </Dialog.Title>

          {step === 'compose' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>
                Starting from the {participants.length} {participants.length === 1 ? 'person' : 'people'} in your current Working List view. Clear the Working List filters first to reach everyone.
              </div>
              <div style={{ display: 'grid', gap: 12, padding: 12, background: 'var(--icplc-bg)', border: '1px solid var(--icplc-border)', borderRadius: 8 }}>
                <ChipGroup title="Registration" options={REGISTRATION} selected={registration} onToggle={toggle(setRegistration)} counts={counts.registration} />
                <ChipGroup title="Documentation" options={DOCUMENTATION} selected={documentation} onToggle={toggle(setDocumentation)} counts={counts.documentation} />
                <ChipGroup title="Subgroup" options={subgroupOptions} selected={subgroups} onToggle={toggle(setSubgroups)} counts={counts.subgroup} />
                <ChipGroup title="Travel" options={TRAVEL} selected={travel} onToggle={toggle(setTravel)} counts={counts.travel} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--icplc-text-soft)' }}>
                  <input type="checkbox" checked={includeNotAttending} onChange={(e) => setIncludeNotAttending(e.target.checked)} />
                  Include people marked not attending
                </label>
                <div role="status" style={{ fontSize: 13, fontWeight: 600, color: recipients.length ? 'var(--icplc-purple)' : 'var(--icplc-red)' }}>
                  {recipients.length} recipient{recipients.length === 1 ? '' : 's'}
                  {noEmailCount > 0 && <span style={{ fontWeight: 400, color: 'var(--icplc-text-soft)' }}> · {noEmailCount} matched without an email address</span>}
                </div>
              </div>

              <label style={{ display: 'grid', gap: 5 }}>
                <span style={label}>Subject</span>
                <input className="icplc-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" maxLength={200} />
              </label>

              <div style={{ display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span style={label}>Message</span>
                  <span style={{ flex: 1 }} />
                  {MERGE_TAGS.map((m) => (
                    <button key={m.tag} type="button" className="icplc-btn" style={{ minHeight: 26, padding: '2px 8px', fontSize: 11.5 }} onClick={() => insertTag(m.tag)}>
                      + {m.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={bodyRef}
                  aria-label="Message"
                  className="icplc-input"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  placeholder={'Hi {{first_name}},\n\n…'}
                  style={{ resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <button type="button" className="icplc-btn" disabled={testing || !subject.trim() || !body.trim()} onClick={sendTest}>
                  {testing ? 'Sending test…' : 'Send test to me'}
                </button>
                {testNote && <span style={{ fontSize: 12, color: 'var(--icplc-green)' }}>{testNote}</span>}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--icplc-text-soft)' }}>
                Preview for {sample.full_name}. Merge tags are filled in per person.
              </div>
              <div style={{ border: '1px solid var(--icplc-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: 'var(--icplc-bg)', borderBottom: '1px solid var(--icplc-border)', fontSize: 13 }}>
                  <div style={{ color: 'var(--icplc-text-soft)', fontSize: 12 }}>To: {sample.email}</div>
                  <div style={{ fontWeight: 700 }}>{personalize(subject, sample)}</div>
                </div>
                <div style={{ padding: 14, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{personalize(body, sample)}</div>
              </div>

              <div>
                <div style={{ ...label, marginBottom: 6 }}>
                  Recipients ({recipients.length} of {withEmail.length})
                  {excluded.size > 0 && (
                    <button type="button" onClick={() => setExcluded(new Set())} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--icplc-purple)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      Select all
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, border: '1px solid var(--icplc-border)', borderRadius: 8 }}>
                  {withEmail.map((p) => {
                    const off = excluded.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={!off}
                        title={off ? 'Click to include' : 'Click to leave out'}
                        onClick={() => setExcluded((prev) => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next })}
                        className="icplc-btn"
                        style={{ minHeight: 26, padding: '2px 9px', fontSize: 12, borderRadius: 14, opacity: off ? 0.45 : 1, textDecoration: off ? 'line-through' : 'none' }}
                      >
                        {p.full_name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <div>Sent to <strong>{result.sent}</strong> {result.sent === 1 ? 'person' : 'people'}.</div>
              {result.failed > 0 && (
                <div role="alert" style={{ color: 'var(--icplc-red)' }}>
                  {result.failed} failed: {(result.errors || []).slice(0, 5).map((e) => e.email).join(', ')}
                </div>
              )}
              {result.skipped > 0 && <div style={{ color: 'var(--icplc-text-soft)' }}>{result.skipped} skipped (no email address).</div>}
            </div>
          )}

          {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--icplc-red)' }}>{error}</div>}

          <div className="icplc-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            {step === 'compose' && (
              <>
                <button type="button" className="icplc-btn" onClick={onClose}>Cancel</button>
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={!canContinue} onClick={() => { setError(null); setStep('confirm') }}>
                  Review
                </button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button type="button" className="icplc-btn" disabled={sending} onClick={() => setStep('compose')}>Back</button>
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={sending || recipients.length === 0} onClick={send}>
                  {sending ? 'Sending…' : `Send to ${recipients.length}`}
                </button>
              </>
            )}
            {step === 'done' && <button type="button" className="icplc-btn icplc-btn-primary" onClick={onClose}>Close</button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function EmailParticipantsButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="icplc-btn" style={{ flexShrink: 0 }}>
      <Mail size={14} aria-hidden /> Email people
    </button>
  )
}
