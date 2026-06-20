import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

function hasRecoveryFragment(hash) {
  return hash.includes('type=recovery') || hash.includes('access_token=')
}

export default function ResetPassword() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const nextPath = new URLSearchParams(location.search).get('next') || '/login'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [checked, setChecked] = useState(false)

  const invalidLink = useMemo(() => checked && !recoveryReady && !user, [checked, recoveryReady, user])

  useEffect(() => {
    let active = true

    const resolveRecovery = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) return

      if (session?.user || hasRecoveryFragment(location.hash)) {
        setRecoveryReady(true)
      }

      setChecked(true)
    }

    resolveRecovery()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setRecoveryReady(true)
        setChecked(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [location.hash])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate(nextPath, { replace: true })
  }

  if (!loading && user && !recoveryReady) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Password Reset
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">Set a new password</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Create a new password for your BLW Canada OS account.
        </p>

        {invalidLink ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--amber)', background: 'var(--amber-light)', color: 'var(--amber-hover)' }}>
            This reset link is invalid or expired. Request a new password reset email.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        ) : null}

        {!checked ? (
          <div className="mt-6 rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Validating reset link...
          </div>
        ) : null}

        {recoveryReady ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Minimum 8 characters"
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
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Updating password...' : 'Update password'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
