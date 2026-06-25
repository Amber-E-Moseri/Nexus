import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { connectUserIntegration } from '../../lib/user-integrations/api'

export default function OutlookCalendarCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get('code')
        const state = searchParams.get('state')

        if (!code) {
          const errorMsg = searchParams.get('error')
          throw new Error(errorMsg || 'No authorization code received')
        }

        if (!profile?.id) {
          throw new Error('User not authenticated')
        }

        // Exchange code for token with backend
        const response = await fetch('/api/integrations/outlook-calendar/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, userId: profile.id }),
        })

        if (!response.ok) {
          throw new Error('Failed to exchange authorization code')
        }

        const outlookData = await response.json()

        // Setup the integration
        await connectUserIntegration({
          user_id: profile.id,
          integration_type: 'outlook_calendar',
          integration_name: outlookData.email || 'Outlook Calendar',
          oauth_token: outlookData.access_token,
          oauth_refresh_token: outlookData.refresh_token,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          settings: {
            email: outlookData.email,
          },
        })

        setStatus('success')
        setTimeout(() => {
          navigate('/settings/integrations')
        }, 1500)
      } catch (err) {
        setStatus('error')
        setError(err.message)
      }
    }

    handleCallback()
  }, [searchParams, profile, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 shadow-lg">
        {status === 'processing' && (
          <div className="space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Connecting Outlook Calendar</h1>
            <p className="text-sm text-[var(--text-secondary)]">Please wait while we complete the setup...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <span className="text-2xl">✓</span>
            </div>
            <h1 className="text-xl font-semibold text-green-700">Connected!</h1>
            <p className="text-sm text-[var(--text-secondary)]">Outlook Calendar is now connected. Redirecting...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="text-2xl">✕</span>
            </div>
            <h1 className="text-xl font-semibold text-red-700">Connection Failed</h1>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
            <button
              onClick={() => navigate('/settings/integrations')}
              className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Back to Integrations
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
