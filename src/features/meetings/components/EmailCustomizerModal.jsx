import { useEffect, useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'

const MODAL_OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
}

const MODAL_BOX = {
  background: 'white',
  borderRadius: 12,
  boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
  maxWidth: 600,
  maxHeight: '90vh',
  width: '95%',
  display: 'flex',
  flexDirection: 'column',
}

const MODAL_HEADER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 24px',
  borderBottom: '1px solid #EDE8DC',
  flexShrink: 0,
}

const MODAL_TITLE = {
  fontSize: 18,
  fontWeight: 700,
  color: '#2D2A22',
  margin: 0,
}

const CLOSE_BUTTON = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#9E9488',
  transition: 'color 0.12s',
}

const MODAL_CONTENT = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  padding: '24px',
  overflowY: 'auto',
  flex: 1,
}

const FIELD_LABEL = {
  fontSize: 12,
  fontWeight: 700,
  color: '#9E9488',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 8,
}

const SELECT = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  fontSize: 13,
  color: '#2D2A22',
  background: 'white',
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
}

const TEXTAREA = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  fontSize: 13,
  color: '#2D2A22',
  fontFamily: 'inherit',
  outline: 'none',
  minHeight: 120,
  resize: 'vertical',
  boxSizing: 'border-box',
}

const PREVIEW_BOX = {
  background: '#F9F7F3',
  border: '1px solid #EDE8DC',
  borderRadius: 8,
  padding: 12,
  maxHeight: 150,
  overflowY: 'auto',
  fontSize: 12,
  color: '#2D2A22',
  lineHeight: 1.5,
}

const HINT = {
  fontSize: 12,
  color: '#9E9488',
  fontStyle: 'italic',
}

const MODAL_FOOTER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 12,
  padding: '16px 24px',
  borderTop: '1px solid #EDE8DC',
  flexShrink: 0,
  background: '#FBF8F2',
}

const BUTTON = {
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.12s',
}

const PRIMARY_BUTTON = {
  ...BUTTON,
  background: '#4C2A92',
  color: 'white',
}

const SECONDARY_BUTTON = {
  ...BUTTON,
  background: 'white',
  border: '1px solid #C4B8E8',
  color: '#4C2A92',
}

export default function EmailCustomizerModal({ recipients = [], onClose, onSendComplete }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    async function loadTemplates() {
      try {
        const { data, error } = await supabase
          .from('absence_email_templates')
          .select('*')
          .order('is_default', { ascending: false })
          .order('name')

        if (error) throw error
        setTemplates(data ?? [])

        // Set default template
        const defaultTemplate = (data ?? []).find(t => t.is_default)
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id)
          setSubject(defaultTemplate.subject)
          setBody(defaultTemplate.body)
        } else if (data?.length > 0) {
          setSelectedTemplateId(data[0].id)
          setSubject(data[0].subject)
          setBody(data[0].body)
        }
      } catch (err) {
        console.error('Failed to load templates:', err)
        showToast('Failed to load email templates', 'error')
      } finally {
        setLoading(false)
      }
    }

    loadTemplates()
  }, [showToast])

  function handleTemplateChange(templateId) {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setSelectedTemplateId(template.id)
      setSubject(template.subject)
      setBody(template.body)
    }
  }

  async function handleSend() {
    if (!recipients.length) {
      showToast('No recipients selected', 'error')
      return
    }

    if (!subject.trim()) {
      showToast('Subject is required', 'error')
      return
    }

    if (!body.trim()) {
      showToast('Email body is required', 'error')
      return
    }

    try {
      setSending(true)

      // Call the send-absence-emails edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-absence-emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.id}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: recipients.map(r => ({
            name: r.name,
            email: r.email,
            subgroup: r.subgroup,
          })),
          subject,
          body_template: body,
          report_id: null, // We're not linking to a specific report for chronic absence emails
          meeting_label: 'Regional Meeting',
          next_date: 'TBD',
          recap: '',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to send emails (${response.status})`)
      }

      const result = await response.json()
      showToast(
        `Sent to ${result.sent} recipient(s)${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}`,
        'success'
      )

      onSendComplete()
    } catch (err) {
      console.error('Send failed:', err)
      showToast(err.message || 'Failed to send emails', 'error')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div style={MODAL_OVERLAY} onClick={onClose}>
        <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '40px', textAlign: 'center', color: '#9E9488' }}>
            Loading templates...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
        <div style={MODAL_HEADER}>
          <h2 style={MODAL_TITLE}>Send Re-engagement Email</h2>
          <button
            type="button"
            style={CLOSE_BUTTON}
            onClick={onClose}
            onMouseOver={(e) => { e.currentTarget.style.color = '#2D2A22' }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#9E9488' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={MODAL_CONTENT}>
          {/* Template selector */}
          <div>
            <label style={FIELD_LABEL}>Template</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={SELECT}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.is_default ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label style={FIELD_LABEL}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{
                ...SELECT,
                padding: '10px 12px',
              }}
            />
          </div>

          {/* Body */}
          <div>
            <label style={FIELD_LABEL}>Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={TEXTAREA}
              placeholder="Use {{name}} for personalization"
            />
            <div style={{ ...HINT, marginTop: 6 }}>
              Variables: {`{{name}}, {{meeting_label}}, {{next_date}}, {{recap}}`}
            </div>
          </div>

          {/* Recipients preview */}
          <div>
            <label style={FIELD_LABEL}>Recipients ({recipients.length})</label>
            <div style={PREVIEW_BOX}>
              {recipients.map(r => (
                <div key={r.id} style={{ marginBottom: 6 }}>
                  <strong>{r.name}</strong> — {r.email}
                </div>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              padding: 12,
              background: '#F0E8FF',
              border: '1px solid #D6CEBE',
              borderRadius: 8,
              fontSize: 12,
              color: '#4C2A92',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Note:</strong> Emails will be sent via Resend. Recipients who have disabled absence email notifications will be automatically skipped.
            </div>
          </div>
        </div>

        <div style={MODAL_FOOTER}>
          <button
            type="button"
            style={SECONDARY_BUTTON}
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            type="button"
            style={{
              ...PRIMARY_BUTTON,
              opacity: sending ? 0.6 : 1,
              cursor: sending ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? 'Sending...' : `Send to ${recipients.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
