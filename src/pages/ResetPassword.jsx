import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { clearRecoveryMode } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // SECURITY FIX: Verify recovery token exists and is not expired
    // This check happens BEFORE rendering the password form
    const recoveryToken = sessionStorage.getItem('recovery_token')
    const tokenExpires = parseInt(sessionStorage.getItem('recovery_token_expires') || '0', 10)
    const now = Date.now()

    if (!recoveryToken) {
      setError('No password reset token found. Please request a new reset link.')
      setTokenExpired(true)
      // Redirect to forgot password after 3 seconds
      setTimeout(() => navigate('/forgot-password', { replace: true }), 3000)
      return
    }

    if (now > tokenExpires) {
      setError('Password reset link has expired. Please request a new reset link.')
      setTokenExpired(true)
      sessionStorage.removeItem('recovery_token')
      sessionStorage.removeItem('recovery_token_expires')
      // Redirect to forgot password after 3 seconds
      setTimeout(() => navigate('/forgot-password', { replace: true }), 3000)
      return
    }

    // Token is valid and not expired
    setTokenValid(true)
  }, [navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    // Validation: Both fields required
    if (!password || !confirmPassword) {
      setError('Both password fields are required.')
      return
    }

    // Validation: Minimum length
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    // Validation: Passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const recoveryToken = sessionStorage.getItem('recovery_token')

      if (!recoveryToken) {
        setError('Recovery token missing. Please request a new reset link.')
        setSaving(false)
        return
      }

      // SECURITY FIX: Update password using recovery token
      // Supabase will validate the token server-side before allowing the update
      // This ensures the token is valid and hasn't been replayed
      const { error: updateError } = await supabase.auth.updateUser(
        { password }
      )

      if (updateError) {
        // Token may be invalid, expired, or already used
        console.error('Password update failed:', updateError)
        setError(updateError.message || 'Failed to reset password. Please request a new reset link.')
        setSaving(false)
        return
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // SUCCESS: Clear recovery state and sign out
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      setSuccess(true)
      // Clears isRecoveryMode and removes recovery_token sessionStorage keys
      clearRecoveryMode()

      // Sign out the recovery session so the new password must be used to log in
      await supabase.auth.signOut()

      // Redirect to login page; user must log in with the new password to confirm it works
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            message: 'Password reset successful. Please log in with your new password.',
          },
        })
      }, 1500) // brief delay to show success message
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  // Show error state if token is invalid or expired
  if (tokenExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Reset Link Expired</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Redirecting to forgot password page...</p>
        </div>
      </div>
    )
  }

  // Show loading state while validating token
  if (!tokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validating reset link...</p>
        </div>
      </div>
    )
  }

  // Show success state with redirect message
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Password Reset Successful</h1>
          <p className="text-gray-600 mb-4">Your password has been updated. You will be redirected to login shortly.</p>
          <p className="text-sm text-gray-500">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Show the secure password reset form
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Password Reset
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">Set a new password</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Create a new password for your BLW CAN NEXUS account.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            {error}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={saving}
              className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
              placeholder="Minimum 8 characters"
              required
              minLength="8"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={saving}
              className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
              placeholder="Repeat your new password"
              required
              minLength="8"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Updating password...' : 'Reset Password'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          Remember your password? <a href="/login" className="text-[var(--accent)] hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  )
}
