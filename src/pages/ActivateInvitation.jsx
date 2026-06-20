import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createNotification } from '../lib/notifications'
import { acceptInvitation, previewInvitation } from '../lib/people/api'
import { supabase } from '../lib/supabase'

export default function ActivateInvitation() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [invitation, setInvitation] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!token) {
      setChecked(true)
      setError('Invitation token is missing.')
      return
    }

    let active = true

    previewInvitation(token)
      .then((nextInvitation) => {
        if (!active) return
        setInvitation(nextInvitation)
        if (!nextInvitation) {
          setError('This invitation is invalid, expired, revoked, or has already been used.')
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError.message)
        }
      })
      .finally(() => {
        if (active) {
          setChecked(true)
        }
      })

    return () => {
      active = false
    }
  }, [token])

  const emailMatchesSession = useMemo(() => {
    if (!user || !invitation) return false
    return user.email?.toLowerCase() === invitation.email?.toLowerCase()
  }, [invitation, user])

  if (!loading && user && !token) {
    return <Navigate to="/dashboard" replace />
  }

  const handleActivate = async (event) => {
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

    try {
      if (!emailMatchesSession) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: invitation.email,
          password,
        })

        if (signUpError && !signUpError.message.toLowerCase().includes('already')) {
          throw signUpError
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        })

        if (signInError) {
          throw signInError
        }
      }

      await acceptInvitation(token)

      if (invitation?.invited_by) {
        await createNotification(invitation.invited_by, 'invitation_accepted', {
          user_name: `${invitation.first_name} ${invitation.last_name}`.trim(),
          user_email: invitation.email,
        })
      }

      navigate('/dashboard', { replace: true })
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Invitation
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
          Accept your invitation
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Create your password to activate your BLW CAN NEXUS access.
        </p>

        {error && (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        )}

        {!checked && !error && (
          <div className="mt-6 rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Validating invitation...
          </div>
        )}

        {invitation && (
          <form className="mt-6 space-y-4" onSubmit={handleActivate}>
            <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <div className="font-medium text-[var(--text-primary)]">
                {invitation.first_name} {invitation.last_name}
              </div>
              <div>{invitation.email}</div>
              <div className="mt-1">
                {invitation.role} · {invitation.department_name}
              </div>
              {invitation.invite_message ? (
                <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-[var(--text-primary)]">
                  {invitation.invite_message}
                </div>
              ) : null}
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Create a password"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Confirm your password"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Activating...' : 'Activate account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
