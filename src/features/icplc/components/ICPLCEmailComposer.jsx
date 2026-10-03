import React, { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Eye, Mail, RefreshCw, Send, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { ICPLC_MERGE_TAGS, estimateRecipients, firstNameOf, replaceMergeTags, renderEmailHtml } from '../lib/emailTemplate.js'
import { REGISTRATION_STATE_LABELS, registrationState } from '../lib/documentationRules.js'
import { deriveFlightStatus, flightStatusLabel } from '../lib/readinessEngine.js'

export function canEstimateICPLCEmail(profile) {
  if (!profile) return false
  return ['super_admin', 'regional_secretary'].includes(profile.role) || profile.is_programs_member === true
}

function previewVars(participants) {
  const sample = participants.find((p) => p.participation_status !== 'not_attending' && p.email) || participants[0] || {}
  return {
    name: sample.full_name || 'Preview Recipient',
    first_name: firstNameOf(sample.full_name || 'Preview Recipient'),
    subgroup: sample.subgroup || 'Preview subgroup',
    email: sample.email || 'preview@example.com',
  }
}

function makeIdempotencyKey(eventId) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${eventId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function Stat({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--icplc-border)', borderRadius: 8, padding: '10px 12px', minWidth: 112 }}>
      <div style={{ fontSize: 11, color: 'var(--icplc-text-soft)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function EmailParticipantsButton({ onClick, count, disabled = false }) {
  return (
    <button type="button" className="icplc-btn" disabled={disabled} onClick={onClick}>
      <Mail size={14} aria-hidden /> Email {count ? `${count}` : ''}
    </button>
  )
}

const FILTERS = [
  {
    key: 'registration',
    label: 'Registration',
    value: (p) => registrationState(p),
    options: Object.entries(REGISTRATION_STATE_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'travel',
    label: 'Travel',
    value: (p) => deriveFlightStatus(p),
    options: ['booked', 'awaiting', 'missing', 'not_required'].map((value) => ({ value, label: flightStatusLabel(value) })),
  },
  {
    key: 'documentation',
    label: 'Passport',
    value: (p) => p.passport_readiness || 'unknown',
    options: [
      ['unknown', 'Unknown'],
      ['ready', 'Ready'],
      ['renewal_needed', 'Renewal needed'],
      ['renewal_in_progress', 'Renewal in progress'],
      ['no_passport', 'No passport'],
      ['unsure', 'Unsure'],
      ['issue', 'Issue'],
    ].map(([value, label]) => ({ value, label })),
  },
]

function displayName(participant) {
  return participant?.full_name || participant?.email || participant?.id || 'Participant'
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row) || ''
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function ChipGroup({ label, options, selected, counts, onToggle }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--icplc-text-soft)' }}>
        {label}{selected.length === 0 ? ' - all' : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className="icplc-chip"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              style={{
                borderColor: active ? 'var(--icplc-purple)' : undefined,
                background: active ? 'var(--icplc-purple-bg)' : undefined,
                color: active ? 'var(--icplc-purple)' : undefined,
              }}
            >
              {option.label} ({counts[option.value] || 0})
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function narrowICPLCEmailCandidates(participants = [], filters = {}, excludedIds = new Set()) {
  const eligibleCandidates = participants.filter((participant) => participant?.participation_status !== 'not_attending')
  const filtered = eligibleCandidates.filter((participant) => (
    FILTERS.every((filter) => {
      const selected = filters[filter.key] || []
      return selected.length === 0 || selected.includes(filter.value(participant))
    }) && ((filters.subgroup || []).length === 0 || (filters.subgroup || []).includes(participant.subgroup || ''))
  ))
  const effective = filtered.filter((participant) => !excludedIds.has(participant.id))
  return { eligibleCandidates, filtered, effective }
}

export { EmailParticipantsButton }

export default function ICPLCEmailComposer({
  eventId,
  eventName,
  sourceLabel,
  participants,
  open,
  onClose,
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('Hi {{first_name}},\n\n')
  const [step, setStep] = useState('compose')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({})
  const [excludedIds, setExcludedIds] = useState(() => new Set())

  const { eligibleCandidates, filtered, effective } = useMemo(
    () => narrowICPLCEmailCandidates(participants, filters, excludedIds),
    [participants, filters, excludedIds],
  )
  const sourceStats = useMemo(() => estimateRecipients(participants), [participants])
  const stats = useMemo(() => estimateRecipients(effective), [effective])
  const counts = useMemo(() => {
    const base = eligibleCandidates
    const next = Object.fromEntries(FILTERS.map((filter) => [filter.key, countBy(base, filter.value)]))
    next.subgroup = countBy(base, (participant) => participant.subgroup || '')
    return next
  }, [eligibleCandidates])
  const subgroupOptions = useMemo(() => (
    Object.keys(counts.subgroup || {})
      .filter(Boolean)
      .sort()
      .map((value) => ({ value, label: value.replace(/^BLW /, '') }))
  ), [counts.subgroup])
  const vars = useMemo(() => previewVars(effective), [effective])
  const subjectPreview = useMemo(() => replaceMergeTags(subject || '', vars), [subject, vars])
  const participantIds = useMemo(() => effective.map((p) => p.id).filter(Boolean), [effective])
  const canContinue = subject.trim().length > 0 && body.trim().length > 0 && stats.unique > 0 && !busy

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: toggleValue(current[key] || [], value) }))
  }

  function toggleExcluded(id) {
    setExcludedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function insertTag(tag) {
    setBody((current) => `${current}${current.endsWith(' ') || current.endsWith('\n') ? '' : ' '}${tag}`)
  }

  async function invoke(payload) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('icplc-send-email', { body: payload })
      if (invokeError) throw invokeError
      setResult(data)
      return data
    } catch (err) {
      setError(err?.message || 'Unable to send email.')
      throw err
    } finally {
      setBusy(false)
    }
  }

  async function testSend() {
    await invoke({ event_id: eventId, subject, body, test: true })
  }

  async function send() {
    const data = await invoke({
      event_id: eventId,
      participant_ids: participantIds,
      subject,
      body,
      idempotency_key: makeIdempotencyKey(eventId),
    })
    if (data) setStep('result')
  }

  async function retryFailed() {
    if (!result?.campaign_id) return
    const data = await invoke({ event_id: eventId, retry_campaign_id: result.campaign_id })
    if (data) setStep('result')
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.38)' }} />
        <Dialog.Content className="icplc-dialog" aria-describedby={undefined} style={{ width: 'min(860px, calc(100vw - 24px))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Dialog.Title style={{ margin: 0, fontSize: 17 }}>ICPLC Email</Dialog.Title>
            <button type="button" className="icplc-btn" onClick={onClose} disabled={busy} aria-label="Close email composer">
              <X size={14} aria-hidden />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
            <Stat label="Source" value={sourceLabel} />
            <Stat label="People" value={sourceStats.requested} />
            <Stat label="Recipients" value={stats.unique} />
            <Stat label="Not Attending" value={sourceStats.skippedNotAttending} />
            <Stat label="Missing/invalid" value={stats.skippedMissing + stats.skippedInvalid} />
            <Stat label="Deduped" value={stats.deduped} />
          </div>

          {step === 'compose' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)', gap: 14 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <section aria-label="Recipients" style={{ display: 'grid', gap: 10, border: '1px solid var(--icplc-border)', borderRadius: 8, padding: 12, background: 'var(--icplc-bg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--icplc-text-soft)' }}>Recipients</div>
                      <div role="status" style={{ fontSize: 13 }}>
                        {stats.unique} effective recipient{stats.unique === 1 ? '' : 's'} from {eligibleCandidates.length} eligible candidate{eligibleCandidates.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    {(excludedIds.size > 0 || Object.values(filters).some((items) => items?.length > 0)) && (
                      <button
                        type="button"
                        className="icplc-btn"
                        onClick={() => { setFilters({}); setExcludedIds(new Set()) }}
                      >
                        Reset recipients
                      </button>
                    )}
                  </div>
                  {FILTERS.map((filter) => (
                    <ChipGroup
                      key={filter.key}
                      label={filter.label}
                      options={filter.options}
                      selected={filters[filter.key] || []}
                      counts={counts[filter.key] || {}}
                      onToggle={(value) => setFilter(filter.key, value)}
                    />
                  ))}
                  {subgroupOptions.length > 0 && (
                    <ChipGroup
                      label="Subgroup"
                      options={subgroupOptions}
                      selected={filters.subgroup || []}
                      counts={counts.subgroup || {}}
                      onToggle={(value) => setFilter('subgroup', value)}
                    />
                  )}
                  <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>
                    Not Attending participants are excluded by the server and cannot be re-enabled here.
                  </div>
                </section>
                <label className="icplc-label">
                  Subject
                  <input className="icplc-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
                  <span style={{ fontSize: 12, color: 'var(--icplc-text-soft)', fontWeight: 400 }}>
                    Preview: {subjectPreview || 'Add a subject to preview merge tags'}
                  </span>
                </label>
                <label className="icplc-label">
                  Body
                  <textarea
                    className="icplc-input"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    placeholder="Write the email body"
                    style={{ resize: 'vertical', lineHeight: 1.5 }}
                  />
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ICPLC_MERGE_TAGS.map((tag) => (
                    <button key={tag} type="button" className="icplc-chip" onClick={() => insertTag(tag)}>{tag}</button>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--icplc-text-soft)', marginBottom: 6 }}>
                    Candidates ({effective.length} included / {filtered.length} matched)
                  </div>
                  <div style={{ maxHeight: 126, overflow: 'auto', border: '1px solid var(--icplc-border)', borderRadius: 8, padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {filtered.length === 0 && <span style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>No candidates match these filters.</span>}
                    {filtered.map((participant) => {
                      const excluded = excludedIds.has(participant.id)
                      return (
                        <button
                          key={participant.id}
                          type="button"
                          className="icplc-chip"
                          aria-pressed={!excluded}
                          onClick={() => toggleExcluded(participant.id)}
                          title={excluded ? 'Click to include' : 'Click to exclude'}
                          style={{ opacity: excluded ? 0.45 : 1, textDecoration: excluded ? 'line-through' : 'none' }}
                        >
                          {displayName(participant)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--icplc-text-soft)', marginBottom: 6 }}>Preview</div>
                <div
                  style={{ maxHeight: 390, overflow: 'auto', border: '1px solid var(--icplc-border)', borderRadius: 8, background: '#fff' }}
                  dangerouslySetInnerHTML={{ __html: renderEmailHtml(body, vars) }}
                />
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: '1px solid var(--icplc-border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', marginBottom: 4 }}>Event</div>
                <strong>{eventName || eventId}</strong>
                <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', marginTop: 8 }}>Subject</div>
                <div>{subjectPreview || subject}</div>
                <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', marginTop: 8 }}>Authoritative recipient count will be rechecked by the server.</div>
              </div>
              <div
                style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--icplc-border)', borderRadius: 8, background: '#fff' }}
                dangerouslySetInnerHTML={{ __html: renderEmailHtml(body, vars) }}
              />
            </div>
          )}

          {step === 'result' && result && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Stat label="Sent" value={result.sent ?? 0} />
                <Stat label="Failed" value={result.failed ?? 0} />
                <Stat label="Campaign" value={result.campaign_id?.slice(0, 8) || 'test'} />
              </div>
              {result.resolution && (
                <div style={{ fontSize: 13, color: 'var(--icplc-text-soft)' }}>
                  Server resolved {result.resolution.unique_recipients} unique recipients from {result.resolution.requested_participants} requested participants.
                </div>
              )}
              {Array.isArray(result.errors) && result.errors.length > 0 && (
                <div style={{ border: '1px solid #F3BDB8', borderRadius: 8, padding: 12, color: '#991B1B', fontSize: 13 }}>
                  {result.errors.slice(0, 5).map((item) => <div key={`${item.email}:${item.error}`}>{item.email}: {item.error}</div>)}
                </div>
              )}
            </div>
          )}

          {error && <div role="alert" style={{ marginTop: 12, color: '#991B1B', fontSize: 13 }}>{error}</div>}

          <div className="icplc-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            {step === 'compose' && (
              <>
                <button type="button" className="icplc-btn" disabled={!canContinue} onClick={testSend}>
                  <Eye size={14} aria-hidden /> Test to me
                </button>
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={!canContinue} onClick={() => setStep('confirm')}>
                  <Check size={14} aria-hidden /> Review send
                </button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button type="button" className="icplc-btn" disabled={busy} onClick={() => setStep('compose')}>Back</button>
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy} onClick={send}>
                  <Send size={14} aria-hidden /> {busy ? 'Sending...' : 'Send email'}
                </button>
              </>
            )}
            {step === 'result' && (
              <>
                {result?.failed > 0 && (
                  <button type="button" className="icplc-btn" disabled={busy} onClick={retryFailed}>
                    <RefreshCw size={14} aria-hidden /> Retry failed
                  </button>
                )}
                <button type="button" className="icplc-btn icplc-btn-primary" disabled={busy} onClick={onClose}>Done</button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
