import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import EmailComposer from '../../modules/communications/EmailComposer'
import EmailPreviewModal from '../../modules/communications/EmailPreviewModal'
import SegmentBuilderAdvanced from '../../modules/communications/SegmentBuilderAdvanced'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#F4F1EA'
const SURFACE = '#FFFFFF'

const STATUS_STYLE = {
  draft:     { bg: '#F4F1EA', color: '#9E9488' },
  scheduled: { bg: '#E8EEFA', color: '#1A56DB' },
  sending:   { bg: '#FEF3C7', color: '#92400E' },
  sent:      { bg: '#EBF7F1', color: '#2D8653' },
  failed:    { bg: '#FEF0ED', color: '#C94830' },
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
  const [step, setStep]             = useState(1)
  const [name, setName]             = useState(initial?.name ?? '')
  const [fromName, setFromName]     = useState(import.meta.env.VITE_FROM_NAME ?? 'BLW Canada')
  const [subject, setSubject]       = useState(initial?.subject ?? '')
  const [body, setBody]             = useState(initial?.body ?? '')
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduledAt, setScheduledAt]   = useState('')
  const [segmentId, setSegmentId]   = useState(initial?.segment_id ?? '')
  const [segments, setSegments]     = useState([])
  const [useCustomFilter, setUseCustomFilter] = useState(false)
  const [inlineConditions, setInlineConditions] = useState(initial?.recipient_filters ?? [])
  const [inlineCount, setInlineCount] = useState(0)
  const [abEnabled, setAbEnabled]   = useState(false)
  const [subjectA, setSubjectA]     = useState('')
  const [subjectB, setSubjectB]     = useState('')
  const [splitPercent, setSplitPercent] = useState(20)
  const [abMetric, setAbMetric]     = useState('opens')
  const [abHours, setAbHours]       = useState(2)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [preview, setPreview]       = useState(false)
  const [templates, setTemplates]   = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [draftCampaignId, setDraftCampaignId] = useState(initial?.id ?? null)

  useEffect(() => {
    supabase.from('communication_segments').select('id, name, estimated_count').order('name')
      .then(({ data }) => setSegments(data ?? []))
    supabase.from('absence_email_templates').select('id, name, subject, body').order('name')
      .then(({ data }) => setTemplates(data ?? []))
  }, [])

  async function autosaveDraft() {
    const payload = {
      name:              name.trim() || 'Untitled Campaign',
      subject:           subject.trim(),
      body:              body.trim(),
      status:            'draft',
      segment_id:        segmentId || null,
      recipient_filters: useCustomFilter ? inlineConditions : [],
      scheduled_at:      scheduleMode === 'later' ? scheduledAt || null : null,
      from_name:         fromName.trim(),
      created_by:        profile?.id ?? null,
    }

    try {
      if (draftCampaignId) {
        await supabase.from('communication_campaigns').update(payload).eq('id', draftCampaignId)
      } else {
        const { data, error: err } = await supabase.from('communication_campaigns').insert(payload).select('id').single()
        if (!err && data) {
          setDraftCampaignId(data.id)
          sessionStorage.setItem('comm_draft_campaign_id', data.id)
        }
      }
    } catch (e) {
      console.error('Autosave failed:', e)
    }
  }

  async function handleNext() {
    await autosaveDraft()
    if (step < 5) {
      setStep(step + 1)
    }
  }

  async function handleSubmit() {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError('Name, subject, and body are required.')
      return
    }
    setSaving(true)
    setError(null)

    const status   = scheduleMode === 'now' ? 'sending' : 'scheduled'
    const payload  = {
      name:              name.trim(),
      subject:           subject.trim(),
      body:              body.trim(),
      status,
      segment_id:        segmentId || null,
      recipient_filters: useCustomFilter ? inlineConditions : [],
      scheduled_at:      scheduleMode === 'later' ? scheduledAt || null : null,
      created_by:        profile?.id ?? null,
    }

    let campaignId = draftCampaignId ?? null

    if (campaignId) {
      const { error: err } = await supabase.from('communication_campaigns').update(payload).eq('id', campaignId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('communication_campaigns').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      campaignId = data.id
    }

    // Save A/B test if enabled
    if (abEnabled && subjectA && subjectB) {
      await supabase.from('communication_ab_tests').insert({
        campaign_id:          campaignId,
        subject_a:            subjectA,
        subject_b:            subjectB,
        split_percent:        splitPercent,
        metric:               abMetric,
        test_duration_hours:  abHours,
      })
    }

    // If send now, resolve recipients and call edge function
    if (scheduleMode === 'now') {
      let recipients = []

      if (segmentId) {
        const { data: seg } = await supabase.from('communication_segments').select('filters').eq('id', segmentId).single()
        if (seg?.filters?.include_roster) {
          const { data: rosterRows } = await supabase.from('expected_attendees').select('full_name, email, subgroup, leadership_category').eq('active', true).not('email', 'is', null)
          recipients = (rosterRows ?? []).map((r) => ({ name: r.full_name ?? r.email, email: r.email, subgroup: r.subgroup, leadership_category: r.leadership_category }))
        }
        // Add more resolution here as needed based on filters
      }

      if (recipients.length > 0) {
        await supabase.functions.invoke('send-communication-email', {
          body: { to: recipients, subject: subject.trim(), body: body.trim(), campaign_id: campaignId, context: { sender_name: profile?.name ?? '' } },
        })
      } else {
        // No segment / no recipients → mark as sent with 0
        await supabase.from('communication_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', campaignId)
      }
    }

    sessionStorage.removeItem('comm_draft_campaign_id')
    setSaving(false)
    onSaved()
  }

  async function handleSendTest(testEmail) {
    await supabase.functions.invoke('send-communication-email', {
      body: { to: [{ name: 'Test Recipient', email: testEmail }], subject: `[TEST] ${subject}`, body },
    })
  }

  const stepLabels = ['Details', 'Recipients', 'Content', 'Schedule', 'Review']

  function getStepStatus(stepNum) {
    if (stepNum < step) return 'completed'
    if (stepNum === step) return 'active'
    return 'upcoming'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error ? (
        <div style={{ background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#C94830' }}>{error}</div>
      ) : null}

      {/* Step indicator - horizontal stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16 }}>
        {stepLabels.map((label, i) => {
          const n = i + 1
          const status = getStepStatus(n)
          const isClickable = status === 'completed'

          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => isClickable && setStep(n)}
                disabled={!isClickable}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: status === 'active' ? `2px solid ${PRIMARY}` : `2px solid ${status === 'completed' ? PRIMARY : BORDER}`,
                  background: status === 'active' ? PRIMARY : status === 'completed' ? PRIMARY : SURFACE,
                  color: status === 'active' || status === 'completed' ? '#FFFFFF' : MUTED,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isClickable ? 'pointer' : 'default',
                }}
              >
                {status === 'completed' ? '✓' : n}
              </button>
              <span style={{ fontSize: 13, fontWeight: step === n ? 700 : 500, color: step === n ? PRIMARY : MUTED, whiteSpace: 'nowrap' }}>
                {label}
              </span>
              {i < stepLabels.length - 1 ? (
                <div style={{ width: 16, height: 2, background: getStepStatus(n + 1) === 'upcoming' ? BORDER : PRIMARY, marginLeft: 4 }}></div>
              ) : null}
            </div>
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
          {/* Mode toggle */}
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
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                Segment
                <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
                  <option value="">— No segment (manual recipients) —</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} (~{s.estimated_count ?? 0} recipients)</option>
                  ))}
                </select>
              </label>
              {segmentId ? (
                <div style={{ background: '#EDE8F8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: PRIMARY }}>
                  Recipients will be resolved from this segment at send time.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: MUTED }}>No segment selected — this campaign will send to 0 recipients. Select a segment to target recipients.</div>
              )}
            </>
          ) : (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                Define filters inline — estimated reach: <strong style={{ color: PRIMARY }}>{inlineCount}</strong> recipients
              </div>
              <SegmentBuilderAdvanced
                segment={{ filters: inlineConditions }}
                onChange={setInlineConditions}
                onEstimate={setInlineCount}
              />
            </div>
          )}
        </div>
      ) : step === 3 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Template selector */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
            Load from template (optional)
            <select
              value={selectedTemplate}
              onChange={(e) => {
                const tmpl = templates.find((t) => t.id === e.target.value)
                if (tmpl) { setSubject(tmpl.subject ?? ''); setBody(tmpl.body ?? '') }
                setSelectedTemplate(e.target.value)
              }}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            >
              <option value="">— Select template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: TEXT, cursor: 'pointer' }}>
            <input type="checkbox" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} />
            Enable A/B subject test
          </label>

          {abEnabled ? (
            <div style={{ background: BG, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                  Subject A
                  <input value={subjectA} onChange={(e) => setSubjectA(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                </label>
                <div style={{ fontSize: 12, marginTop: 4, color: subjectA.length <= 60 ? '#2D8653' : subjectA.length <= 80 ? '#92400E' : '#C94830' }}>
                  {subjectA.length} / 60 characters
                </div>
              </div>
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                  Subject B
                  <input value={subjectB} onChange={(e) => setSubjectB(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                </label>
                <div style={{ fontSize: 12, marginTop: 4, color: subjectB.length <= 60 ? '#2D8653' : subjectB.length <= 80 ? '#92400E' : '#C94830' }}>
                  {subjectB.length} / 60 characters
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>
                  Test group size
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min={10} max={50} value={splitPercent} onChange={(e) => setSplitPercent(Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontSize: 13, color: TEXT, fontWeight: 700, minWidth: 32 }}>{splitPercent}%</span>
                  </div>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>
                  Metric
                  <select value={abMetric} onChange={(e) => setAbMetric(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                    <option value="opens">Opens</option>
                    <option value="clicks">Clicks</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>
                  Pick winner after
                  <select value={abHours} onChange={(e) => setAbHours(Number(e.target.value))} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                    {[1, 2, 4, 8].map((h) => <option key={h} value={h}>{h}h</option>)}
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {/* Subject (single) + body editor. When A/B is on, the subject is owned
              by the A/B inputs above, so the composer hides its own subject. */}
          <EmailComposer
            value={body}
            onChange={setBody}
            subject={subject}
            onSubjectChange={setSubject}
            showSubject={!abEnabled}
            variables={VARIABLE_CHIPS}
            templates={[]}
            previewVisible={false}
            autosave={false}
          />

          {!abEnabled ? (
            <div style={{ fontSize: 12, color: subject.length <= 60 ? '#2D8653' : subject.length <= 80 ? '#92400E' : '#C94830', marginTop: -8 }}>
              {subject.length} / 60 characters
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setPreview(true)}
            style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            Preview email
          </button>
        </div>
      ) : step === 5 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Review Your Campaign</div>

          {/* Read-only review summary */}
          <div style={{ background: BG, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: MUTED }}>Campaign name</span>
              <strong style={{ color: TEXT }}>{name || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: MUTED }}>From name</span>
              <strong style={{ color: TEXT }}>{fromName || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: MUTED }}>Recipients</span>
              <strong style={{ color: TEXT }}>
                {useCustomFilter ? `Custom filter (~${inlineCount})` : (segments.find((s) => s.id === segmentId)?.name ?? 'None')}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: MUTED }}>Subject</span>
              <strong style={{ color: TEXT }}>
                {abEnabled && subjectA && subjectB ? `${subjectA} / ${subjectB}` : subject || '—'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: MUTED }}>Send time</span>
              <strong style={{ color: TEXT }}>
                {scheduleMode === 'now' ? 'Now' : scheduledAt ? new Date(scheduledAt).toLocaleString() : '(no date set)'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: MUTED }}>Recurring</span>
              <strong style={{ color: TEXT }}>
                {abEnabled ? `A/B test — ${splitPercent}% split, pick winner after ${abHours}h` : 'None'}
              </strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: TEXT, cursor: 'pointer' }}>
              <input type="radio" name="schedule" value="now" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} />
              Send now
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: TEXT, cursor: 'pointer' }}>
              <input type="radio" name="schedule" value="later" checked={scheduleMode === 'later'} onChange={() => setScheduleMode('later')} />
              Schedule for later
            </label>
          </div>

          {scheduleMode === 'later' ? (
            <div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                Date &amp; time
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', maxWidth: 280 }} />
              </label>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>Times are Eastern (Toronto).</div>
            </div>
          ) : null}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {step === 5 ? '← Back to edit' : 'Back'}
            </button>
          ) : null}
          <button type="button" onClick={onCancel} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
        {step < 4 ? (
          <button type="button" onClick={handleNext} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Next
          </button>
        ) : step === 4 ? (
          <button type="button" onClick={handleNext} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Confirm and send'}
          </button>
        )}
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
    </div>
  )
}

function CampaignReport({ campaign, onClose }) {
  const [sends, setSends]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [abTest, setAbTest]       = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('communication_sends').select('*').eq('campaign_id', campaign.id).order('created_at'),
      supabase.from('communication_ab_tests').select('*').eq('campaign_id', campaign.id).single(),
    ]).then(([sendsRes, abRes]) => {
      setSends(sendsRes.data ?? [])
      if (!abRes.error) setAbTest(abRes.data)
      setLoading(false)
    })
  }, [campaign.id])

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return sends
    return sends.filter((s) => s.status === filterStatus)
  }, [sends, filterStatus])

  const delivered  = sends.filter((s) => s.status !== 'failed' && s.status !== 'bounced').length
  const opened     = sends.filter((s) => s.status === 'opened').length
  const failedRows = sends.filter((s) => s.status === 'failed' || s.status === 'bounced').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[
          { label: 'Recipients', value: campaign.recipient_count ?? sends.length },
          { label: 'Delivered', value: `${delivered} (${sends.length ? Math.round((delivered / sends.length) * 100) : 0}%)` },
          { label: 'Opened', value: sends.length ? `${opened} (${Math.round((opened / sends.length) * 100)}%)` : 'N/A' },
          { label: 'Failed', value: failedRows },
        ].map((stat) => (
          <div key={stat.label} style={{ flex: '1 1 140px', background: BG, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTED }}>{stat.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginTop: 4 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {abTest ? (
        <div style={{ background: '#EDE8F8', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: 8 }}>A/B Test Results</div>
          <div style={{ fontSize: 13, color: TEXT }}>
            Subject A: <strong>{abTest.subject_a}</strong> ·
            Subject B: <strong>{abTest.subject_b}</strong>
            {abTest.winner_subject ? <span style={{ marginLeft: 8, color: '#2D8653', fontWeight: 700 }}>Winner: {abTest.winner_subject} ✓</span> : <span style={{ marginLeft: 8, color: MUTED }}>(pending)</span>}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'opened', 'failed', 'bounced'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilterStatus(f)}
            style={{ border: `1px solid ${filterStatus === f ? PRIMARY : BORDER}`, background: filterStatus === f ? '#EDE8F8' : '#FFFFFF', color: filterStatus === f ? PRIMARY : MUTED, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: MUTED, fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: BG }}>
                {['Email', 'Name', 'Status', 'Opened At', 'Error'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${BORDER}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '9px 10px', color: TEXT }}>{s.recipient_email}</td>
                  <td style={{ padding: '9px 10px', color: TEXT }}>{s.recipient_name}</td>
                  <td style={{ padding: '9px 10px' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: '9px 10px', color: MUTED }}>{s.opened_at ? new Date(s.opened_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: '9px 10px', color: '#C94830', fontSize: 11 }}>{s.error_message ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>No records.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CampaignPage() {
  const navigate   = useNavigate()
  const [campaigns, setCampaigns]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null) // null | { mode: 'create' | 'edit' | 'report', campaign? }
  const [statusFilter, setStatusFilter] = useState(null) // null = all, else specific status
  const [sortBy, setSortBy] = useState('created_at') // created_at | name | open_count | sent_at
  const [sortAsc, setSortAsc] = useState(false)
  const [draftCampaignId, setDraftCampaignId] = useState(null)

  async function loadCampaigns() {
    setLoading(true)
    let query = supabase.from('communication_campaigns').select('*')

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query.order(sortBy, { ascending: sortAsc })
    setCampaigns(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadCampaigns()
    const draftId = sessionStorage.getItem('comm_draft_campaign_id')
    setDraftCampaignId(draftId)
  }, [statusFilter, sortBy, sortAsc])

  async function handleDelete(id) {
    if (!window.confirm('Delete this campaign?')) return
    await supabase.from('communication_campaigns').delete().eq('id', id)
    await loadCampaigns()
  }

  async function handleCancel(id) {
    await supabase.from('communication_campaigns').update({ status: 'cancelled' }).eq('id', id)
    await loadCampaigns()
  }

  async function handleDuplicate(campaign) {
    const { data } = await supabase
      .from('communication_campaigns')
      .insert({
        name: `${campaign.name} (Copy)`,
        subject: campaign.subject,
        preview_text: campaign.preview_text ?? null,
        body: campaign.body,
        body_html: campaign.body_html ?? campaign.body,
        body_text: campaign.body_text ?? campaign.body,
        recipient_filters: campaign.recipient_filters ?? [],
        status: 'draft',
        segment_id: campaign.segment_id,
        from_name: campaign.from_name ?? 'BLW Canada',
        reply_to_email: campaign.reply_to_email ?? null,
        sent_count: 0,
        failed_count: 0,
      })
      .select('id')
      .single()
    if (data) {
      sessionStorage.setItem('comm_draft_campaign_id', data.id)
      navigate(`/communications/campaigns/${data.id}/edit`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => navigate('/communications')} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            {'<-'} Communications
          </button>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Campaigns</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Campaigns</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Schedule and track bulk email sends.</p>
          </div>
          <button type="button" onClick={() => navigate('/communications/compose')} style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + New Campaign
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {/* Draft banner */}
        {draftCampaignId ? (
          <div style={{ background: '#E8EEFA', border: `1px solid #1A56DB`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: '#1A56DB', fontWeight: 500 }}>
              You have an unsaved draft — continue editing to complete it.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  navigate(`/communications/campaigns/${draftCampaignId}/edit`)
                }}
                style={{ border: `1px solid #1A56DB`, background: '#FFFFFF', color: '#1A56DB', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Continue editing
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('comm_draft_campaign_id')
                  setDraftCampaignId(null)
                  supabase.from('communication_campaigns').delete().eq('id', draftCampaignId)
                }}
                style={{ border: `1px solid #D8D3C9`, background: '#FFFFFF', color: MUTED, borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {/* Filter + Sort Controls */}
        {campaigns.length > 0 && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Status Filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'].map((status) => {
                const count = campaigns.filter((c) => c.status === status).length
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                    style={{
                      border: `1px solid ${statusFilter === status ? PRIMARY : BORDER}`,
                      background: statusFilter === status ? '#EDE8F8' : SURFACE,
                      color: statusFilter === status ? PRIMARY : MUTED,
                      borderRadius: 999,
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {status} {count > 0 && <span style={{ marginLeft: 4 }}>({count})</span>}
                  </button>
                )
              })}
            </div>

            {/* Sort Control */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  border: `1px solid ${BORDER}`,
                  background: SURFACE,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: TEXT,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="created_at">Sort: Date Created</option>
                <option value="name">Sort: Name</option>
                <option value="sent_at">Sort: Date Sent</option>
                <option value="open_count">Sort: Open Rate</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                style={{
                  border: `1px solid ${BORDER}`,
                  background: SURFACE,
                  color: TEXT,
                  borderRadius: 6,
                  width: 38,
                  height: 36,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title={sortAsc ? 'Ascending' : 'Descending'}
              >
                {sortAsc ? '↑' : '↓'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : campaigns.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            {statusFilter ? 'No campaigns with this status.' : 'No campaigns yet. Create one to get started.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', borderRadius: 14, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: BG }}>
                  {['Name', 'Status', 'Recipients', 'Sent', 'Opens', 'Scheduled / Sent', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: `1px solid ${BORDER}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: TEXT, fontSize: 13 }}>{c.name}</td>
                    <td style={{ padding: '12px 14px' }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{c.recipient_count ?? '—'}</td>
                    <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{c.sent_count ?? '—'}</td>
                    <td style={{ padding: '12px 14px', color: MUTED, fontSize: 13 }}>{c.open_count ?? '—'}</td>
                    <td style={{ padding: '12px 14px', color: MUTED, fontSize: 12 }}>
                      {c.status === 'sent' && c.sent_at ? new Date(c.sent_at).toLocaleDateString() : c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.status === 'draft' ? (
                          <>
                            <button type="button" onClick={() => navigate(`/communications/campaigns/${c.id}/edit`)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            <button type="button" onClick={() => handleDelete(c.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#C94830', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                            <button type="button" onClick={() => handleDuplicate(c)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Duplicate</button>
                          </>
                        ) : c.status === 'scheduled' ? (
                          <>
                            <button type="button" onClick={() => navigate(`/communications/campaigns/${c.id}/edit`)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            <button type="button" onClick={() => handleCancel(c.id)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#C94830', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button type="button" onClick={() => handleDuplicate(c)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Duplicate</button>
                          </>
                        ) : c.status === 'sent' ? (
                          <>
                            <button type="button" onClick={() => setModal({ mode: 'report', campaign: c })} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>View Report</button>
                            <button type="button" onClick={() => handleDuplicate(c)} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Duplicate</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'report' ? (
        <Modal title={`Report: ${modal.campaign?.name}`} wide onClose={() => setModal(null)}>
          <CampaignReport campaign={modal.campaign} onClose={() => setModal(null)} />
        </Modal>
      ) : null}
    </div>
  )
}
