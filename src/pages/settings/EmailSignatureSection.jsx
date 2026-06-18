import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'

const VARIABLE_CHIPS = [
  { label: '{{your_name}}', value: '{{your_name}}' },
  { label: '{{your_role}}', value: '{{your_role}}' },
  { label: '{{org_name}}', value: '{{org_name}}' },
]

export default function EmailSignatureSection({ userId, profile }) {
  const textareaRef = useRef(null)
  const [signature, setSignature] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!userId) return
    loadSignature()
  }, [userId])

  async function loadSignature() {
    setLoading(true)
    const { data } = await supabase
      .from('email_signatures')
      .select('signature_html')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()

    setSignature(data?.signature_html ?? '')
    setLoading(false)
  }

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    setMessage('')

    const { data: existing } = await supabase
      .from('email_signatures')
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('email_signatures')
        .update({ signature_html: signature })
        .eq('id', existing.id)

      if (error) {
        setMessage(`Error: ${error.message}`)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('email_signatures').insert({
        user_id: userId,
        signature_html: signature,
        is_default: true,
      })

      if (error) {
        setMessage(`Error: ${error.message}`)
        setSaving(false)
        return
      }
    }

    setMessage('Signature saved.')
    setSaving(false)
  }

  function insertVariable(value) {
    if (!textareaRef.current) return
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = signature.substring(0, start)
    const after = signature.substring(end)
    setSignature(before + value + after)
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + value.length
      textarea.focus()
    }, 0)
  }

  return (
    <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Email Signature</h3>
      <p style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
        Plain text or basic HTML. Added automatically to the bottom of all emails you send.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: MUTED, fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>Signature</span>
            <textarea
              ref={textareaRef}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              style={{
                width: '100%',
                minHeight: 120,
                border: `1px solid ${BORDER}`,
                borderRadius: 9,
                padding: '12px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
              placeholder="e.g., Best regards, {{your_name}} ({{your_role}})"
            />
          </label>

          <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {VARIABLE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => insertVariable(chip.value)}
                style={{
                  border: `1px solid ${PRIMARY}`,
                  background: '#EDE8F8',
                  color: PRIMARY,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = PRIMARY
                  e.currentTarget.style.color = SURFACE
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#EDE8F8'
                  e.currentTarget.style.color = PRIMARY
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {message && (
            <p style={{ fontSize: 12, color: message.startsWith('Error') ? '#C94830' : '#2D8653', marginBottom: 12 }}>
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              border: 'none',
              background: PRIMARY,
              color: SURFACE,
              borderRadius: 9,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save signature'}
          </button>
        </>
      )}
    </section>
  )
}
