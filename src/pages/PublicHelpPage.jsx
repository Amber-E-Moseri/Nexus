import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PublicHelpPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const { error: insertError } = await supabase.from('public_help_requests').insert({
      name: name.trim(),
      email: email.trim() || null,
      message: message.trim(),
      category: 'support',
    })

    setSubmitting(false)

    if (insertError) {
      setError('Something went wrong. Please try again or contact us directly.')
      return
    }

    setSubmitted(true)
  }

  const firstName = name.trim().split(' ')[0]

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px 64px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Back link */}
        <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 32 }}>
          ← Back to login
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #4C2A92 0%, #6B4BBE 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 12px 28px rgba(76,42,146,0.22)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.03em' }}>Need help?</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Send us your name and complaint and we'll get back to you.</p>
        </div>

        {submitted ? (
          <div style={{ background: 'var(--sage-light)', border: '1px solid var(--sage-border)', borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sage)', margin: '0 0 6px' }}>Got it{firstName ? `, ${firstName}` : ''}!</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>We received your message and will follow up soon.</p>
            <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>← Back to login</Link>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 20, padding: '28px 28px', boxShadow: '0 8px 28px rgba(28,22,16,0.08)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Full name <span style={{ color: 'var(--coral)' }}>*</span></span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Email <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Message <span style={{ color: 'var(--coral)' }}>*</span></span>
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or complaint..."
                  rows={5}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
              </label>

              {error && (
                <div style={{ background: 'var(--coral-light)', border: '1px solid var(--coral)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--coral-dark)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{ background: submitting ? 'var(--text-tertiary)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: submitting ? 'none' : '0 6px 20px rgba(76,42,146,0.22)', transition: 'all 0.15s' }}
              >
                {submitting ? 'Sending...' : 'Send message'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
