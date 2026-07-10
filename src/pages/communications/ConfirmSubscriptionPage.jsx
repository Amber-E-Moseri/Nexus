import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'

const ORG_NAME = import.meta.env.VITE_FROM_NAME ?? 'BLW CAN NEXUS'

export default function ConfirmSubscriptionPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('loading') // loading | success | invalid | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function confirmSubscription() {
      if (!token) {
        setState('invalid')
        return
      }

      try {
        // Look up the contact by token.
        const { data: contact, error: lookupError } = await supabase
          .from('communication_contacts')
          .select('id, email, full_name, status')
          .eq('confirm_token', token)
          .maybeSingle()

        if (lookupError || !contact) {
          setState('invalid')
          return
        }

        if (contact.status === 'active') {
          // Already confirmed.
          setState('success')
          return
        }

        // Activate the contact.
        const { error: updateError } = await supabase
          .from('communication_contacts')
          .update({
            status: 'active',
            confirm_token: null, // Clear the token after use.
            subscribed_at: new Date().toISOString(),
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', contact.id)

        if (updateError) {
          setErrorMessage(updateError.message)
          setState('error')
          return
        }

        setState('success')
      } catch (err) {
        setErrorMessage(err?.message ?? 'Something went wrong.')
        setState('error')
      }
    }

    confirmSubscription()
  }, [token])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app, #FAFAF8)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '32px 28px', boxShadow: '0 8px 28px rgba(28,22,16,0.10)', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: PRIMARY, marginBottom: 10 }}>
          {ORG_NAME}
        </div>

        {state === 'loading' && (
          <>
            <h1 style={{ fontFamily: FONT_HEADING, margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: TEXT }}>
              Confirming…
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Just a moment while we activate your subscription.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontFamily: FONT_HEADING, margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: TEXT }}>
              You're subscribed!
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              Thanks for confirming your email. You'll start receiving updates from us soon.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Back to home
            </button>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <h1 style={{ fontFamily: FONT_HEADING, margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: TEXT }}>
              Link not found
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              This confirmation link is invalid or has expired. Please sign up again.
            </p>
            <button
              type="button"
              onClick={() => navigate('/subscribe')}
              style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Sign up again
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontFamily: FONT_HEADING, margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: TEXT }}>
              Something went wrong
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              {errorMessage || 'We encountered an error while confirming your subscription. Please try again.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
