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
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_15%_0%,_rgba(232,160,32,0.15),_transparent_30%),radial-gradient(circle_at_50%_0%,_rgba(76,42,146,0.12),_transparent_28%),radial-gradient(circle_at_82%_4%,_rgba(107,75,190,0.10),_transparent_32%)]" />

      <div className="relative z-10 w-full max-w-[500px]">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl shadow-[0_18px_40px_rgba(28,22,16,0.12)]" style={{ background: 'linear-gradient(135deg, #4C2A92 0%, #6B4BBE 100%)' }}>
            <img src="/canada_sr.png" alt="BLW CAN NEXUS" width="56" height="56" className="h-14 w-14 object-contain filter brightness-0 invert" />
          </div>
          <h1 className="mt-6 text-[40px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Welcome back!
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Sign in to access BLW CAN NEXUS.
          </p>
          {resetMessage ? (
            <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--sage-border)', background: 'var(--sage-light)', color: 'var(--sage)' }}>
              {resetMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-8 rounded-[20px] border border-[var(--border)] bg-white p-6 shadow-[0_8px_28px_rgba(28,22,16,0.10)] sm:p-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">Work email</span>
              <div className="flex items-center gap-3 rounded-md border border-(--border) bg-white px-4 py-3 transition focus-within:border-(--accent) focus-within:shadow-[0_0_0_3px_rgba(76,42,146,.09)]">
                <Mail size={18} className="text-[var(--text-tertiary)]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@blwcannexus.org"
                  className="w-full border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-primary)]">Password</span>
              <div className="flex items-center gap-3 rounded-md border border-(--border) bg-white px-4 py-3 transition focus-within:border-(--accent) focus-within:shadow-[0_0_0_3px_rgba(76,42,146,.09)]">
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
              <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md py-3.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: submitting ? 'var(--text-tertiary)' : 'var(--accent)', boxShadow: submitting ? 'none' : '0 8px 24px rgba(76,42,146,0.22)' }}
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
