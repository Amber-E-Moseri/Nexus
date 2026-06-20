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
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let active = true

    // If coming from Supabase redirect (after verify), check session and navigate
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (session?.user) {
        setSessionReady(true)
        // Session established, go to reset-password
        navigate('/reset-password', { replace: true })
        return
      }
    }

    // Set up listener for session changes (from Supabase verify redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (session?.user) {
        setSessionReady(true)
        navigate('/reset-password', { replace: true })
      }
    })

    checkSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [navigate])

  // Original code flow: look up link in database
  useEffect(() => {
    if (!code || sessionReady) return
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
  }, [code, sessionReady])

  const handleClick = () => {
    if (link) {
      setLoading(true)
      window.location.href = link
    }
  }

  // If session is being established by Supabase redirect, show loading
  if (!code) {
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

  // Original code flow: show button to redirect
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

        {error && (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        )}

        {link && !error ? (
          <button
            onClick={handleClick}
            disabled={loading}
            className="mt-8 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : 'Set my password'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
