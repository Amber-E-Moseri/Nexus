// NOT IMPLEMENTED — future feature. Outlook Calendar sync is not built.
// Only the OAuth callback route exists as a placeholder.
// The route /auth/outlook_calendar-callback lands here but immediately shows an error.
import { useNavigate } from 'react-router-dom'

export default function OutlookCalendarCallback() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 shadow-lg space-y-4 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Outlook Calendar</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Outlook Calendar sync is not yet available. Only Google Calendar is currently supported.
        </p>
        <button
          onClick={() => navigate('/settings/integrations')}
          className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Back to Integrations
        </button>
      </div>
    </div>
  )
}
