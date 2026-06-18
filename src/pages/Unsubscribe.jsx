import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const email    = params.get('email') ?? ''
  const token    = params.get('token') ?? ''

  const [phase, setPhase]       = useState('loading') // loading | success | error
  const [resubDone, setResubDone] = useState(false)
  const [resubbing, setResubbing] = useState(false)

  useEffect(() => {
    if (!email || !token) {
      setPhase('error')
      return
    }

    supabase.functions
      .invoke('handle-unsubscribe', { body: { email, token, action: 'unsubscribe' } })
      .then(({ data, error }) => {
        if (error || !data?.success) {
          setPhase('error')
        } else {
          setPhase('success')
        }
      })
      .catch(() => setPhase('error'))
  }, [email, token])

  async function handleResubscribe() {
    setResubbing(true)
    try {
      const { data } = await supabase.functions.invoke('handle-unsubscribe', {
        body: { email, token, action: 'resubscribe' },
      })
      if (data?.success) setResubDone(true)
    } finally {
      setResubbing(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F1EA',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(28,22,16,0.14)',
          background: '#FFFFFF',
        }}
      >
        {/* Purple header bar */}
        <div
          style={{
            background: 'linear-gradient(135deg, #4C2A92, #6B3FD4)',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>BLW Canada OS</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            Regional Ministry Operations
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: '32px 28px', textAlign: 'center' }}>
          {phase === 'loading' ? (
            <div style={{ fontSize: 14, color: '#9E9488' }}>Processing your request...</div>
          ) : phase === 'success' ? (
            resubDone ? (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: '#EDE8F8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    margin: '0 auto 18px',
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2D2A22', marginBottom: 8 }}>
                  You're resubscribed
                </div>
                <div style={{ fontSize: 13, color: '#9E9488' }}>
                  {email} will receive emails from BLW Canada OS again.
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: '#EBF7F1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    margin: '0 auto 18px',
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2D2A22', marginBottom: 10 }}>
                  You have been unsubscribed
                </div>
                <div style={{ fontSize: 13, color: '#9E9488', marginBottom: 24, lineHeight: 1.6 }}>
                  <strong style={{ color: '#2D2A22' }}>{email}</strong> will no longer receive
                  emails from BLW Canada OS.
                </div>
                <button
                  type="button"
                  onClick={handleResubscribe}
                  disabled={resubbing}
                  style={{
                    border: '1px solid #EDE8DC',
                    background: '#FFFFFF',
                    color: '#4C2A92',
                    borderRadius: 10,
                    padding: '10px 20px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: resubbing ? 'not-allowed' : 'pointer',
                    opacity: resubbing ? 0.7 : 1,
                  }}
                >
                  {resubbing ? 'Processing...' : 'Changed your mind? Re-subscribe'}
                </button>
              </>
            )
          ) : (
            <>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  background: '#FEF0ED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  margin: '0 auto 18px',
                }}
              >
                ✕
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2D2A22', marginBottom: 10 }}>
                Invalid or expired unsubscribe link
              </div>
              <div style={{ fontSize: 13, color: '#9E9488', lineHeight: 1.6 }}>
                Please contact your subgroup pastor to be removed manually.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
