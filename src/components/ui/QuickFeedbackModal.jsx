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
    function onKey(e) { if (e.key === 'Escape') onClose() }
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

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qfm-title"
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--surface-card, #fff)',
          borderRadius: 16,
          padding: '24px 24px 20px',
          boxShadow: '0 8px 40px rgba(28,22,16,.18)',
          fontFamily: FONT_BODY,
          position: 'relative',
          border: '1px solid var(--border-1, #E7E5DE)',
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3, #6D6860)', fontSize: 16, lineHeight: 1,
            padding: '3px 7px', borderRadius: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light, #EDE8F8)'; e.currentTarget.style.color = 'var(--ink-1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ink-3)' }}
        >
          ✕
        </button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
            <p style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>Got it, thanks!</p>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 5 }}>We'll look into it shortly.</p>
          </div>
        ) : (
          <>
            <h2 id="qfm-title" style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 16, paddingRight: 24 }}>
              Tell us what happened
            </h2>

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {TYPES.map((t) => {
                const active = type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px',
                      borderRadius: 99,
                      border: `1.5px solid ${active ? 'var(--accent, #4C2A92)' : 'var(--border-1, #E7E5DE)'}`,
                      background: active ? 'var(--accent-light, #EDE8F8)' : 'transparent',
                      color: active ? 'var(--accent, #4C2A92)' : 'var(--ink-2, #4A4641)',
                      fontFamily: FONT_BODY, fontSize: 13, fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                )
              })}
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
                padding: '10px 12px',
                borderRadius: 10,
                border: '1.5px solid var(--border-1, #E7E5DE)',
                background: 'var(--bg-app, #FAFAF8)',
                color: 'var(--ink-1, #1C1610)',
                fontFamily: FONT_BODY,
                fontSize: 13.5,
                lineHeight: 1.55,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.12s',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent, #4C2A92)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-1, #E7E5DE)' }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1.5px solid var(--border-1, #E7E5DE)',
                  background: 'transparent',
                  color: 'var(--ink-2, #4A4641)',
                  fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-app)'; e.currentTarget.style.borderColor = 'var(--ink-3)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!body.trim() || sending}
                className="btn-primary"
                style={{
                  padding: '8px 20px',
                  fontSize: 13, fontWeight: 700,
                  opacity: !body.trim() || sending ? 0.45 : 1,
                  cursor: !body.trim() || sending ? 'not-allowed' : 'pointer',
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
