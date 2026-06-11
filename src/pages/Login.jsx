import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const resetMessage = location.state?.message ?? ''

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-hidden bg-white px-6 pb-12 pt-24">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_15%_0%,_rgba(255,147,62,0.22),_transparent_30%),radial-gradient(circle_at_50%_0%,_rgba(240,63,134,0.24),_transparent_28%),radial-gradient(circle_at_82%_4%,_rgba(123,104,238,0.18),_transparent_32%),radial-gradient(circle_at_100%_0%,_rgba(104,188,255,0.2),_transparent_28%)]" />

      <div className="relative z-10 w-full max-w-[500px]">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_18px_40px_rgba(20,20,43,0.08)]">
            <div className="h-8 w-8 rounded-[10px] bg-[linear-gradient(135deg,_#f03f86,_#7b68ee)]" />
          </div>
          <h1 className="mt-6 text-[40px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Welcome back!
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Sign in to access BLW Canada OS.
          </p>
          {resetMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {resetMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-8 rounded-[28px] border border-[var(--border)] bg-white p-6 shadow-[0_20px_48px_rgba(20,20,43,0.06)] sm:p-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">Password</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 transition focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-muted)]">
                <LockKeyhole size={18} className="text-[var(--text-tertiary)]" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
                />
              </div>
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b9b9bc] py-3.5 text-sm font-semibold text-white transition enabled:bg-[linear-gradient(135deg,_#f03f86,_#7b68ee)] enabled:shadow-[0_16px_34px_rgba(123,104,238,0.24)] enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>{submitting ? 'Logging in...' : 'Log In'}</span>
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-5 text-center text-sm">
            <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">
              Forgot Password?
            </Link>
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-[var(--text-secondary)]">Need help?</div>
      </div>
    </div>
  )
}
