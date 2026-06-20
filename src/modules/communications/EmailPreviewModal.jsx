import { useState } from 'react'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'

const SAMPLE = {
  name:              'Jane Smith',
  meeting_label:     'Toronto Regional Leaders Meeting - July 19',
  next_date:         'Next Sunday',
  recap:             'We shared a recap on soul winning focus, upcoming prayer targets, and department handoff actions.',
  subgroup:          'Central East',
  leadership_category: 'Cell Leader',
  space_name:        'Media',
  pastor_name:       'Pastor John',
  sender_name:       'BLW CAN NEXUS Team',
  org_name:          'BLW CAN NEXUS',
  date_today:        new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  unsubscribe_link:  '#unsubscribe',
}

function fillVars(template, recipient) {
  if (!template) return ''
  const r = { ...SAMPLE, ...(recipient ?? {}) }
  return template
    .replace(/\{\{name\}\}/g, r.name)
    .replace(/\{\{meeting_label\}\}/g, r.meeting_label)
    .replace(/\{\{next_date\}\}/g, r.next_date)
    .replace(/\{\{recap\}\}/g, r.recap)
    .replace(/\{\{subgroup\}\}/g, r.subgroup)
    .replace(/\{\{leadership_category\}\}/g, r.leadership_category)
    .replace(/\{\{space_name\}\}/g, r.space_name)
    .replace(/\{\{pastor_name\}\}/g, r.pastor_name)
    .replace(/\{\{sender_name\}\}/g, r.sender_name)
    .replace(/\{\{org_name\}\}/g, r.org_name)
    .replace(/\{\{date_today\}\}/g, r.date_today)
    .replace(/\{\{unsubscribe_link\}\}/g, r.unsubscribe_link)
}

function escapeHtml(v) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function renderHtml(text) {
  const escaped    = escapeHtml(text ?? '')
  const paragraphs = `<p style="margin:0 0 14px">${escaped.split('\n\n').join('</p><p style="margin:0 0 14px">')}</p>`
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#4C2A92,#6B3FD4);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;">
        <div style="color:white;font-size:18px;font-weight:800;">BLW CAN NEXUS</div>
        <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">Regional Ministry Operations</div>
      </div>
      <div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 4px;">${paragraphs}</div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">
        BLW CAN NEXUS | Sent via BLW CAN NEXUS<br>
        <a href="#" style="color:#9E9488;text-decoration:underline;">Unsubscribe</a>
        &nbsp;·&nbsp;
        <a href="#" style="color:#9E9488;text-decoration:underline;">View in browser</a>
      </div>
    </div>
  `
}

export default function EmailPreviewModal({ subject, body, previewRecipient, onClose, onSendTest }) {
  const [tab, setTab]             = useState('desktop')
  const [testEmail, setTestEmail] = useState(previewRecipient?.email ?? '')
  const [testSent, setTestSent]   = useState(false)
  const [testSending, setTestSending] = useState(false)

  const filledSubject = fillVars(subject, previewRecipient)
  const filledBody    = fillVars(body, previewRecipient)
  const htmlContent   = renderHtml(filledBody)

  async function handleSendTest() {
    if (!testEmail.trim() || testSending) return
    setTestSending(true)
    try {
      await onSendTest(testEmail.trim())
      setTestSent(true)
    } finally {
      setTestSending(false)
    }
  }

  const tabs = [
    { key: 'desktop',   label: 'Desktop' },
    { key: 'mobile',    label: 'Mobile' },
    { key: 'plaintext', label: 'Plain Text' },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,14,30,0.5)', padding: 24 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 700, background: '#FFFFFF', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(14,14,30,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>Email Preview</div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>

        {/* Subject */}
        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 8 }}>Subject:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{filledSubject || '(no subject)'}</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? PRIMARY : 'transparent'}`,
                background: 'transparent',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? PRIMARY : MUTED,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Preview body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: '#F9F7F3' }}>
          {tab === 'desktop' ? (
            <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 20, boxShadow: '0 2px 8px rgba(28,22,16,.08)' }}>
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
          ) : tab === 'mobile' ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 375, border: '8px solid #2D2A22', borderRadius: 40, padding: 12, background: 'white', minHeight: 600, overflow: 'hidden' }}>
                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
              </div>
            </div>
          ) : (
            <textarea
              readOnly
              value={filledBody}
              rows={20}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', background: '#FFFFFF', color: TEXT, resize: 'vertical' }}
            />
          )}
        </div>

        {/* Test send */}
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: TEXT, fontWeight: 600, flexShrink: 0 }}>Send a test email to:</span>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => { setTestEmail(e.target.value); setTestSent(false) }}
            placeholder="test@example.com"
            style={{ flex: 1, minWidth: 180, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 11px', fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testSending || !testEmail.trim()}
            style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: testSending || !testEmail.trim() ? 'not-allowed' : 'pointer', opacity: testSending || !testEmail.trim() ? 0.6 : 1, flexShrink: 0 }}
          >
            {testSending ? 'Sending...' : 'Send Test'}
          </button>
          {testSent ? <span style={{ fontSize: 12, fontWeight: 700, color: '#2D8653' }}>✓ Test sent!</span> : null}
        </div>
      </div>
    </div>
  )
}
