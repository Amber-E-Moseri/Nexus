import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { exchangeMinistryCalendarConnectionCode } from '../../features/calendar/lib/calendar'

// Callback for the Ministry Calendar's shared Google connection (one account
// covers all sources — org calendar, Birthdays, Holidays, etc). Unlike the
// old space-scoped callback, there's no spaceId/orgId in the OAuth state —
// just a fixed marker, since this connection isn't scoped to anything.
export default function MinistryCalendarConnectionCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get('code')
        if (!code) throw new Error(searchParams.get('error') || 'No authorization code received')
        if (!profile?.id) throw new Error('User not authenticated')

        await exchangeMinistryCalendarConnectionCode({ code, userId: profile.id })
        setStatus('success')
        setTimeout(() => navigate('/calendar/settings'), 1500)
      } catch (err) {
        setStatus('error')
        setError(err.message)
      }
    }

    if (profile !== undefined) {
      handleCallback()
    }
  }, [searchParams, profile, navigate])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' }}>
      <div style={{ borderRadius: '16px', border: '1px solid var(--border)', backgroundColor: 'white', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '360px', width: '100%' }}>
        {status === 'processing' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid #BFDBFE', borderTopColor: '#2563EB', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>Connecting Google Calendar</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Finishing setup…</p>
          </div>
        )}
        {status === 'success' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>✓</div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: '#15803D', margin: 0 }}>Connected!</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Redirecting to Calendar Settings…</p>
          </div>
        )}
        {status === 'error' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>✕</div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: '#B91C1C', margin: 0 }}>Connection Failed</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{error}</p>
            <button
              onClick={() => navigate('/calendar/settings')}
              style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
            >
              Back to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
