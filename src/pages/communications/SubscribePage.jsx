import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'

const ORG_NAME = import.meta.env.VITE_FROM_NAME ?? 'BLW CAN NEXUS'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function SubscribePage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState('form') // form | submitting | success | already | error
  const [errorMessage, setErrorMessage] = useState('')

  const emailValid = EMAIL_RE.test(email.trim().toLowerCase())

  async function handleSubmit(e) {
    e.preventDefault()
    if (!emailValid || state === 'submitting') return
    setState('submitting')
    setErrorMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('subscribe', {
        body: { full_name: fullName.trim(), email: email.trim() },
      })
      if (error) {
        // Edge function returns non-2xx (e.g. 409 unsubscribed) as an error with context.
        let msg = 'Something went wrong. Please try again.'
        try {
          const parsed = await error.context?.json?.()
          if (parsed?.error) msg = parsed.error
        } catch { /* keep default */ }
        setErrorMessage(msg)
        setState('error')
        return
      }
      setState(data?.status === 'already_subscribed' ? 'already' : 'success')
    } catch (err) {
      setErrorMessage(err?.message ?? 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  const isDone = state === 'success' || state === 'already'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app, #FAFAF8)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '32px 28px', boxShadow: '0 8px 28px rgba(28,22,16,0.10)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: PRIMARY }}>
            {ORG_NAME}
          </div>
          <h1 style={{ fontFamily: FONT_HEADING, margin: '10px 0 6px', fontSize: 24, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
            {isDone ? 'You’re all set' : 'Join our mailing list'}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
            {state === 'success' && 'Thanks for subscribing — you’ll hear from us soon.'}
            {state === 'already' && 'You’re already on the list. Nothing more to do!'}
            {!isDone && 'Get announcements, events, and updates delivered to your inbox.'}
          </p>
        </div>

        {isDone ? (
          <div style={{ textAlign: 'center', fontSize: 40 }} aria-hidden>
            ✅
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: TEXT }}>
              Name <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 13px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: TEXT }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 13px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
              />
            </label>

            {state === 'error' ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-red-text)', background: 'var(--accent-red-tint)', borderRadius: 10, padding: '10px 13px' }}>
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!emailValid || state === 'submitting'}
              style={{ marginTop: 4, border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: !emailValid || state === 'submitting' ? 'not-allowed' : 'pointer', opacity: !emailValid || state === 'submitting' ? 0.6 : 1 }}
            >
              {state === 'submitting' ? 'Subscribing…' : 'Subscribe'}
            </button>

            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
              We’ll only email you relevant updates. You can unsubscribe at any time.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
