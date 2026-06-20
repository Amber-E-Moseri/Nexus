import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function SignupInvite() {
  const location = useLocation()
  const navigate = useNavigate()

  const params = new URLSearchParams(location.search)
  const inviteToken = params.get('invite')
  const inviteEmail = params.get('email')

  const [sprintId, setSprintId] = useState(null)
  const [sprintName, setSprintName] = useState(null)
  const [role, setRole] = useState(null)
  const [userName, setUserName] = useState(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [inviteData, setInviteData] = useState(null)

  // Validate invite token
  useEffect(() => {
    if (!inviteToken || !inviteEmail) {
      setError('Invalid invite link')
      setValidating(false)
      return
    }

    const validateInvite = async () => {
      const { data, error: fetchError } = await supabase
        .from('sprint_invite_tokens')
        .select('id, sprint_id, expires_at, used_at')
        .eq('token', inviteToken)
        .eq('email', inviteEmail)
        .maybeSingle()

      if (fetchError) {
        setError('Error validating invite')
        setValidating(false)
        return
      }

      if (!data) {
        setError('Invalid or expired invite link')
        setValidating(false)
        return
      }

      if (data.used_at) {
        setError('This invite has already been used')
        setValidating(false)
        return
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invite has expired')
        setValidating(false)
        return
      }

      setInviteData(data)
      setSprintId(data.sprint_id)

      // Fetch sprint details
      const { data: sprint } = await supabase
        .from('sprints')
        .select('name, id')
        .eq('id', data.sprint_id)
        .single()

      if (sprint) {
        setSprintName(sprint.name)
      }

      setUserName(inviteEmail.split('@')[0])
      setRole('member') // Default role
      setValidating(false)
    }

    validateInvite()
  }, [inviteToken, inviteEmail])

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
      console.log('[1] Starting signup for', inviteEmail)

      // Create user via edge function (avoids Supabase email sending)
      const createRes = await supabase.functions.invoke('create-invite-user', {
        body: {
          email: inviteEmail,
          password,
          name: userName || inviteEmail.split('@')[0],
        },
      })

      console.log('[2] User created:', createRes)

      if (createRes.error || !createRes.data?.user_id) {
        setError(createRes.error?.message || 'Failed to create account')
        setLoading(false)
        return
      }

      const userId = createRes.data.user_id

      console.log('[3] Adding to sprint:', sprintId)

      // Add user to sprint via edge function (admin context)
      const { data: rpcResult, error: rpcError } = await supabase.functions.invoke('add-sprint-member', {
        body: {
          user_id: userId,
          email: inviteEmail,
          name: userName || inviteEmail.split('@')[0],
          sprint_id: sprintId,
          role: role || 'member',
          invite_token: inviteToken,
        },
      })

      console.log('[4] Sprint add result:', rpcResult, rpcError)

      if (rpcError || !rpcResult?.success) {
        console.error('Failed to add to sprint:', rpcError || rpcResult?.error)
        setError('Account created but failed to add to sprint')
        setLoading(false)
        return
      }

      console.log('[5] Marking token as used')

      // Mark invite as used
      await supabase
        .from('sprint_invite_tokens')
        .update({ user_id: userId, used_at: new Date().toISOString() })
        .eq('token', inviteToken)
        .catch(() => null)

      console.log('[6] Redirecting to sprint')

      // Redirect to sprint
      navigate(`/sprints/${sprintId}`, { replace: true })
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
            BLW CAN NEXUS
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Verifying invite…
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Please wait while we validate your invitation.
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
            BLW CAN NEXUS
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Invitation Error
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
          BLW CAN NEXUS
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
          Create your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Join {sprintName || 'the sprint'} by creating your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              disabled
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)] cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm placeholder:text-[var(--text-tertiary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm placeholder:text-[var(--text-tertiary)]"
            />
          </div>

          {error && (
            <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account & join sprint'}
          </button>
        </form>
      </div>
    </div>
  )
}
