import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import EmailComposer from './EmailComposer'
import EmailPreviewModal from './EmailPreviewModal'
import SendConfirmationModal from './SendConfirmationModal'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

const STATUS_STYLE = {
  draft: { bg: '#F4F1EA', color: '#9E9488' },
  scheduled: { bg: '#E8EEFA', color: '#1A56DB' },
  sending: { bg: '#FEF3C7', color: '#92400E' },
  sent: { bg: '#EBF7F1', color: '#2D8653' },
  failed: { bg: '#FEF0ED', color: '#C94830' },
  cancelled: { bg: '#F4F1EA', color: '#9E9488' },
}

const VARIABLE_CHIPS = [
  '{{name}}', '{{subgroup}}', '{{leadership_category}}', '{{space_name}}',
  '{{pastor_name}}', '{{sender_name}}', '{{org_name}}', '{{date_today}}',
  '{{meeting_label}}', '{{next_date}}', '{{recap}}',
]

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{ display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

function Modal({ title, wide, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,30,0.45)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: wide ? 800 : 560, background: '#FFFFFF', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(14,14,30,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{title}</div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <div style={{ padding: 20, maxHeight: '80vh', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function CampaignForm({ initial, onSaved, onCancel }) {
  const { profile } = useAuth()
  const [step, setStep] = useState(1)
  const [name, setName] = useState(initial?.name ?? '')
  const [fromName, setFromName] = useState(import.meta.env.VITE_FROM_NAME ?? 'BLW CAN NEXUS')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [segmentId, setSegmentId] = useState(initial?.segment_id ?? '')
  const [segments, setSegments] = useState([])
  const [useCustomFilter, setUseCustomFilter] = useState(false)
  const [inlineConditions, setInlineConditions] = useState(initial?.recipient_filters ?? [])
  const [inlineCount, setInlineCount] = useState(0)
  const [abEnabled, setAbEnabled] = useState(false)
  const [subjectA, setSubjectA] = useState('')
  const [subjectB, setSubjectB] = useState('')
  const [splitPercent, setSplitPercent] = useState(20)
  const [abMetric, setAbMetric] = useState('opens')
  const [abHours, setAbHours] = useState(2)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [recipientCount, setRecipientCount] = useState(0)
  const [suppressedCount, setSuppressedCount] = useState(0)

  useEffect(() => {
    supabase.from('communication_segments').select('id, name, estimated_count').order('name')
      .then(({ data }) => setSegments(data ?? []))
    supabase.from('communication_email_templates').select('id, name, subject, body').order('name')
      .then(({ data }) => setTemplates(data ?? []))
  }, [])

  async function handleSubmit() {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError('Name, subject, and body are required.')
      return
    }

    // If sending now, show confirmation modal
    if (scheduleMode === 'now') {
      // Calculate recipient count from segment
      let count = 0
      if (segmentId) {
        const { data: seg } = await supabase.from('communication_segments').select('estimated_count').eq('id', segmentId).single()
        count = seg?.estimated_count ?? 0
      }
      setRecipientCount(count)

      // Get suppressed count
      const { count: suppressed } = await supabase
        .from('email_bounces')
        .select('id', { count: 'exact' })
      setSuppressedCount(suppressed ?? 0)

      setShowSendConfirm(true)
      return
    }

    // If scheduling, proceed directly
    await handleConfirmSend()
  }

  async function handleConfirmSend() {
    setSaving(true)
    setError(null)
    setShowSendConfirm(false)

    const status = scheduleMode === 'now' ? 'sending' : 'scheduled'
    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      status,
      segment_id: segmentId || null,
      recipient_filters: useCustomFilter ? inlineConditions : [],
      scheduled_at: scheduleMode === 'later' ? scheduledAt || null : null,
      created_by: profile?.id ?? null,
    }

    let campaignId = initial?.id ?? null

    if (campaignId) {
      const { error: err } = await supabase.from('communication_campaigns').update(payload).eq('id', campaignId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('communication_campaigns').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      campaignId = data.id
    }

    if (abEnabled && subjectA && subjectB) {
      await supabase.from('communication_ab_tests').insert({
        campaign_id: campaignId,
        subject_a: subjectA,
        subject_b: subjectB,
        split_percent: splitPercent,
        metric: abMetric,
        test_duration_hours: abHours,
      })
    }

    if (scheduleMode === 'now') {
      let recipients = []

      if (segmentId) {
        const { data: seg } = await supabase.from('communication_segments').select('filters').eq('id', segmentId).single()
        if (seg?.filters?.include_roster) {
          const { data: rosterRows } = await supabase.from('expected_attendees').select('full_name, email, subgroup, leadership_category').eq('active', true).not('email', 'is', null)
          recipients = (rosterRows ?? []).map((r) => ({ name: r.full_name ?? r.email, email: r.email, subgroup: r.subgroup, leadership_category: r.leadership_category }))
        }
      }

      if (recipients.length > 0) {
        await supabase.functions.invoke('send-communication-email', {
          body: { to: recipients, subject: subject.trim(), body: body.trim(), campaign_id: campaignId, context: { sender_name: profile?.name ?? '' } },
        })
      } else {
        await supabase.from('communication_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', campaignId)
      }
    }

    setSaving(false)
    onSaved?.()
  }

  async function handleSendTest(testEmail) {
    await supabase.functions.invoke('send-communication-email', {
      body: { to: [{ name: 'Test Recipient', email: testEmail }], subject: `[TEST] ${subject}`, body },
    })
  }

  const stepLabels = ['Details', 'Recipients', 'Content', 'Schedule']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {error ? (
        <div style={{ background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#C94830' }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 0 }}>
        {stepLabels.map((label, i) => {
          const n = i + 1
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(n)}
              style={{
                flex: 1, border: 'none', borderBottom: `2px solid ${step === n ? PRIMARY : BORDER}`,
                background: 'transparent', padding: '8px 4px', fontSize: 12, fontWeight: step === n ? 700 : 500,
                color: step === n ? PRIMARY : MUTED, cursor: 'pointer',
              }}
            >
              {n}. {label}
            </button>
          )
        })}
      </div>

      {step === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
            Campaign name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
            From name
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </label>
        </div>
      ) : step === 2 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setUseCustomFilter(false)}
              style={{ flex: 1, padding: '9px 0', border: `2px solid ${!useCustomFilter ? PRIMARY : BORDER}`, borderRadius: 9, background: !useCustomFilter ? '#EDE8F8' : '#FFFFFF', color: !useCustomFilter ? PRIMARY : MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Use saved segment
            </button>
            <button
              type="button"
              onClick={() => setUseCustomFilter(true)}
              style={{ flex: 1, padding: '9px 0', border: `2px solid ${useCustomFilter ? PRIMARY : BORDER}`, borderRadius: 9, background: useCustomFilter ? '#EDE8F8' : '#FFFFFF', color: useCustomFilter ? PRIMARY : MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Build custom filter
            </button>
          </div>

          {!useCustomFilter ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
              Select segment
              <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                <option value="">-- Choose segment --</option>
                {segments.map((seg) => (
                  <option key={seg.id} value={seg.id}>{seg.name} ({seg.estimated_count ?? '?'} members)</option>
                ))}
              </select>
            </label>
          ) : (
            <div style={{ padding: 12, background: '#F9F7F3', borderRadius: 9, color: MUTED, fontSize: 12 }}>
              Custom filters coming soon
            </div>
          )}
        </div>
      ) : step === 3 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </label>

          <EmailComposer value={body} onChange={setBody} variableChips={VARIABLE_CHIPS} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
              <input type="checkbox" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} /> A/B Test subject lines
            </label>
            {abEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: '#F9F7F3', borderRadius: 9 }}>
                <input placeholder="Subject A" value={subjectA} onChange={(e) => setSubjectA(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <input placeholder="Subject B" value={subjectB} onChange={(e) => setSubjectB(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <label style={{ fontSize: 12, color: TEXT }}>
                  Test split: {splitPercent}%
                  <input type="range" min="5" max="50" value={splitPercent} onChange={(e) => setSplitPercent(parseInt(e.target.value))} style={{ marginLeft: 8 }} />
                </label>
                <label style={{ fontSize: 12, color: TEXT }}>
                  Measure by:
                  <select value={abMetric} onChange={(e) => setAbMetric(e.target.value)} style={{ marginLeft: 8, fontFamily: 'inherit' }}>
                    <option value="opens">Opens</option>
                    <option value="clicks">Clicks</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPreview(true)}
            style={{ padding: '8px 14px', background: BORDER, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: TEXT, cursor: 'pointer' }}
          >
            Preview
          </button>
        </div>
      ) : step === 4 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setScheduleMode('now')}
              style={{ flex: 1, padding: '9px 0', border: `2px solid ${scheduleMode === 'now' ? PRIMARY : BORDER}`, borderRadius: 9, background: scheduleMode === 'now' ? '#EDE8F8' : '#FFFFFF', color: scheduleMode === 'now' ? PRIMARY : MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Send now
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode('later')}
              style={{ flex: 1, padding: '9px 0', border: `2px solid ${scheduleMode === 'later' ? PRIMARY : BORDER}`, borderRadius: 9, background: scheduleMode === 'later' ? '#EDE8F8' : '#FFFFFF', color: scheduleMode === 'later' ? PRIMARY : MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Schedule for later
            </button>
          </div>

          {scheduleMode === 'later' && (
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '10px 16px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{ padding: '10px 16px', background: PRIMARY, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : (initial?.id ? 'Update' : 'Create')} Campaign
        </button>
      </div>

      {preview ? (
        <EmailPreviewModal
          subject={subject}
          body={body}
          previewRecipient={null}
          onClose={() => setPreview(false)}
          onSendTest={handleSendTest}
        />
      ) : null}

      {showSendConfirm ? (
        <SendConfirmationModal
          campaign={{ subject, body, from_email: 'noreply@blwcannexus.ca', from_name: fromName }}
          recipientCount={recipientCount}
          suppressedCount={suppressedCount}
          onConfirm={handleConfirmSend}
          onCancel={() => setShowSendConfirm(false)}
          loading={saving}
        />
      ) : null}
    </div>
  )
}

export default function CampaignEditor({ campaignId, onSaved, onCancel }) {
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(!!campaignId)

  useEffect(() => {
    if (campaignId) {
      supabase
        .from('communication_campaigns')
        .select('id, name, subject, body, segment_id, recipient_filters')
        .eq('id', campaignId)
        .single()
        .then(({ data }) => {
          setCampaign(data)
          setLoading(false)
        })
    }
  }, [campaignId])

  if (loading) {
    return <div style={{ color: MUTED }}>Loading campaign...</div>
  }

  return <CampaignForm initial={campaign} onSaved={onSaved} onCancel={onCancel} />
}
