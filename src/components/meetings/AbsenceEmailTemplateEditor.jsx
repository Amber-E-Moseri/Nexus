import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

const MERGE_TAGS = [
  { tag: '{{member_name}}', label: 'Member Name' },
  { tag: '{{meeting_date}}', label: 'Meeting Date' },
  { tag: '{{meeting_name}}', label: 'Meeting Name' },
  { tag: '{{department}}', label: 'Department' },
]

export default function AbsenceEmailTemplateEditor({ onClose, onSaved }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bodyRef, setBodyRef] = useState(null)

  useEffect(() => {
    loadTemplate()
  }, [])

  async function loadTemplate() {
    try {
      const { data, error: fetchErr } = await supabase
        .from('absence_email_templates')
        .select('subject, body')
        .limit(1)
        .maybeSingle()

      if (fetchErr) throw fetchErr
      if (data) {
        setSubject(data.subject || '')
        setBody(data.body || '')
      }
    } catch (err) {
      console.error('Failed to load template:', err)
    } finally {
      setLoading(false)
    }
  }

  function insertTag(tag) {
    if (!bodyRef) return
    const textarea = bodyRef
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? 0
    const before = body.substring(0, start)
    const after = body.substring(end)
    const newBody = before + tag + after
    setBody(newBody)
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + tag.length
    }, 0)
  }

  async function handleSave() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { error: upsertErr } = await supabase
        .from('absence_email_templates')
        .upsert(
          { subject, body, updated_at: new Date().toISOString() },
          { onConflict: 'id' },
        )

      if (upsertErr) throw upsertErr

      setSaved(true)
      setTimeout(() => {
        onSaved?.()
        onClose()
      }, 800)
    } catch (err) {
      setError(err.message ?? 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', background: 'rgba(14,14,30,0.5)', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '32px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
          Loading template...
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', background: 'rgba(14,14,30,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', margin: 'auto' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 600, width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px rgba(0,0,0,0.15)', margin: 'auto' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>Absence Email Template</h2>
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
              <X size={20} color={MUTED} />
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                placeholder="We missed you at {{meeting_name}}"
              />
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Email Body
              </label>

              {/* Merge Tags Bar */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
                {MERGE_TAGS.map(({ tag, label }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    title="Replaced with real value when sent"
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      border: `1px solid ${PRIMARY}`,
                      background: '#EDE8F8',
                      color: PRIMARY,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = PRIMARY
                      e.currentTarget.style.color = '#FFFFFF'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#EDE8F8'
                      e.currentTarget.style.color = PRIMARY
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                ref={setBodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{
                  flex: 1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  minHeight: 180,
                  boxSizing: 'border-box',
                }}
                placeholder="Hi {{member_name}},&#10;&#10;We missed you at {{meeting_name}} on {{meeting_date}}.&#10;Please make sure to attend our next meeting.&#10;&#10;Thanks!"
              />
            </div>

            {/* Error */}
            {error ? (
              <div style={{ background: '#FEF0ED', border: `1px solid #F5C4B8`, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#C94830' }}>
                {error}
              </div>
            ) : null}

            {/* Saved */}
            {saved ? (
              <div style={{ background: '#EBF7F1', border: `1px solid #A5D6D3`, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#2D8653', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> Saved!
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                border: `1px solid ${BORDER}`,
                background: '#FFFFFF',
                color: TEXT,
                borderRadius: 6,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                border: 'none',
                background: PRIMARY,
                color: '#FFFFFF',
                borderRadius: 6,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
