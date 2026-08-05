import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

const TYPES = [
  { value: 'bug', label: "Something's broken", icon: '🐛', placeholder: 'What went wrong? What were you trying to do?' },
  { value: 'feature_request', label: 'I have an idea', icon: '💡', placeholder: "What's your idea? How would it help?" },
]

export default function QuickFeedbackModal({ userId, userName, onClose }) {
  const [type, setType] = useState('bug')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const textareaRef = useRef(null)
  const overlayRef = useRef(null)

  const selectedType = TYPES.find((t) => t.value === type)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    if (!body.trim() || sending) return
    setSending(true)
    const page = window.location.pathname
    const title = type === 'bug'
      ? `Bug report from ${userName} on ${page}`
      : `Feature idea from ${userName}`
    await supabase.from('support_tickets').insert({
      title,
      description: `Page: ${page}\n\n${body.trim()}`,
      category: type,
      priority: type === 'bug' ? 'normal' : 'low',
      submitted_by: userId,
    })
    setSent(true)
    setTimeout(onClose, 1600)
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qfm-title"
        style={{
          width: '100%', maxWidth: 480,
          background: '#131720',
          borderRadius: 18,
          padding: '28px 28px 24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          fontFamily: FONT_BODY,
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', fontSize: 18, lineHeight: 1,
            padding: '2px 6px', borderRadius: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f9fafb'; e.currentTarget.style.background = '#ffffff14' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'none' }}
        >
          ✕
        </button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <p style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 700, color: '#f9fafb' }}>Got it, thanks!</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>We'll look into it shortly.</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20, paddingRight: 24 }}>
              <h2 id="qfm-title" style={{ fontFamily: FONT_HEADING, fontSize: 17, fontWeight: 700, color: '#f9fafb', marginBottom: 8 }}>
                Tell us what happened
              </h2>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
                We already know which page you were on and what you were doing — just say it in your own words.
              </p>
            </div>

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 14px',
                    borderRadius: 99,
                    border: `1.5px solid ${type === t.value ? '#10b981' : '#2d3748'}`,
                    background: type === t.value ? '#0d2b22' : '#1a1f2e',
                    color: type === t.value ? '#10b981' : '#9ca3af',
                    fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
              placeholder={selectedType.placeholder}
              rows={5}
              style={{
                width: '100%',
                resize: 'none',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1.5px solid #2d3748',
                background: '#1a1f2e',
                color: '#f9fafb',
                fontFamily: FONT_BODY,
                fontSize: 13.5,
                lineHeight: 1.55,
                outline: 'none',
                boxSizing: 'border-box',
                caretColor: '#10b981',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#10b981' }}
              onBlur={(e) => { e.target.style.borderColor = '#2d3748' }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 18px', borderRadius: 10,
                  border: '1.5px solid #2d3748',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4b5563'; e.currentTarget.style.color = '#f9fafb' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2d3748'; e.currentTarget.style.color = '#9ca3af' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!body.trim() || sending}
                style={{
                  padding: '9px 22px', borderRadius: 10, border: 'none',
                  background: !body.trim() || sending ? '#1a2e26' : '#0d5c42',
                  color: !body.trim() || sending ? '#4b7a65' : '#fff',
                  fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700,
                  cursor: !body.trim() || sending ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
