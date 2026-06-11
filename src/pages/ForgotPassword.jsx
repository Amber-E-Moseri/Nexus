import { ArrowLeft, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUCCESS_MESSAGE = 'If an account exists for this email, a reset link has been sent.'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    setSubmitting(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSubmitted(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-secondary)] px-6 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-white p-8 shadow-[0_24px_80px_rgba(48,40,105,0.12)]">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} />
          Back to login
        </Link>

        <h1 className="mt-6 text-3xl font-semibold text-[var(--text-primary)]">Forgot password</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Enter your work email and we will send a password reset link if the account exists.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {SUCCESS_MESSAGE}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-primary)]">Work email</span>
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 transition focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-muted)]">
              <Mail size={18} className="text-[var(--text-tertiary)]" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@blwcanada.org"
                className="w-full border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  )
}
