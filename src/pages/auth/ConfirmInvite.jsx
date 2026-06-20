import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ConfirmInvite() {
  const location = useLocation()
  const navigate = useNavigate()
  const code = new URLSearchParams(location.search).get('code')
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // If no code, we're coming from Supabase redirect after verify
  // Just wait for session to be established and navigate to reset-password
  useEffect(() => {
    if (code) return // Code flow handles separately below

    let active = true
    let timeout

    // Set up listener for session establishment
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (session?.user) {
        clearTimeout(timeout)
        navigate('/reset-password', { replace: true })
      }
    })

    // Fallback: if no session change after 5 seconds, show error
    timeout = setTimeout(() => {
      if (active) {
        setError('Session verification timeout. Please try the invite link again.')
      }
    }, 5000)

    return () => {
      active = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [code, navigate])

  // Code flow: look up link in database
  useEffect(() => {
    if (!code) return
    const fetchLink = async () => {
      const { data, error: fetchError } = await supabase
        .from('invite_link_codes')
        .select('action_link')
        .eq('code', code)
        .maybeSingle()

      if (fetchError || !data?.action_link) {
        setError('Invalid or expired invite link')
        return
      }
      setLink(data.action_link)
    }
    fetchLink()
  }, [code])

  const handleClick = () => {
    if (link) {
      setLoading(true)
      window.location.href = link
    }
  }

  // No code: show loading (waiting for Supabase redirect)
  if (!code && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            BLW CAN NEXUS
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Setting up your account…
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Verifying your invitation link.
          </p>
        </div>
      </div>
    )
  }

  // Has error
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            BLW CAN NEXUS
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Invitation Error
          </h1>
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        </div>
      </div>
    )
  }

  // Has code: show button to redirect
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          BLW CAN NEXUS
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
          You've been invited
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Click the button below to set your password and access your sprint.
        </p>

        {link && (
          <button
            onClick={handleClick}
            disabled={loading}
            className="mt-8 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : 'Set my password'}
          </button>
        )}
      </div>
    </div>
  )
}
