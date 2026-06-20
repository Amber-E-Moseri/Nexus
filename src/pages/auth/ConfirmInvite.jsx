import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ConfirmInvite() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type') || 'recovery'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleClick = async () => {
    if (!tokenHash) return
    setLoading(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })
    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }
    // Session is now active — go straight to password reset
    navigate('/reset-password', { replace: true })
  }

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

        {!tokenHash ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            Invalid invite link. Please contact your admin for a new invitation.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        ) : null}

        {tokenHash ? (
          <button
            onClick={handleClick}
            disabled={loading}
            className="mt-8 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Set my password'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
