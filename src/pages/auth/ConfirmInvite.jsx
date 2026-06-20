import { useState } from 'react'
import { useLocation } from 'react-router-dom'

export default function ConfirmInvite() {
  const location = useLocation()
  const link = new URLSearchParams(location.search).get('link')
  const [clicked, setClicked] = useState(false)

  const handleClick = () => {
    if (link) {
      setClicked(true)
      window.location.href = link
    }
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

        {!link ? (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
            Invalid invite link. Please contact your admin for a new invitation.
          </div>
        ) : (
          <button
            onClick={handleClick}
            disabled={clicked}
            className="mt-8 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {clicked ? 'Redirecting…' : 'Set my password'}
          </button>
        )}
      </div>
    </div>
  )
}
