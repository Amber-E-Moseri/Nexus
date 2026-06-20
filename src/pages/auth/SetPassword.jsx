import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function SetPassword() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = new URLSearchParams(location.search).get('token')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [tokenData, setTokenData] = useState(null)

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided')
      setValidating(false)
      return
    }

    const validateToken = async () => {
      const { data, error: fetchError } = await supabase
        .from('sprint_invite_tokens')
        .select('id, user_id, sprint_id, email, expires_at, used_at')
        .eq('token', token)
        .maybeSingle()

      if (fetchError) {
        setError('Error validating token')
        setValidating(false)
        return
      }

      if (!data) {
        setError('Invalid invitation token')
        setValidating(false)
        return
      }

      if (data.used_at) {
        setError('This invitation has already been used')
        setValidating(false)
        return
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired')
        setValidating(false)
        return
      }

      setTokenData(data)
      setValidating(false)
    }

    validateToken()
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Set password for the user
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      // Mark token as used
      const { error: markError } = await supabase
        .from('sprint_invite_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenData.id)

      if (markError) {
        console.error('Failed to mark token as used:', markError)
        // Continue anyway, user is authenticated
      }

      // Navigate to the sprint
      navigate(`/sprints/${tokenData.sprint_id}`, { replace: true })
    } catch (err) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Validating
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Checking your invitation…
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Please wait while we verify your link.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Invitation Error
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Invalid or Expired Link
          </h1>
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            Please request a new invitation from your sprint organizer.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Set Password
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
          Complete your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Set a password to access BLW CAN NEXUS and get started with your sprint.
        </p>

        {error && (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Minimum 8 characters"
              disabled={loading}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Repeat your new password"
              disabled={loading}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Setting password…' : 'Set password & join sprint'}
          </button>
        </form>
      </div>
    </div>
  )
}
