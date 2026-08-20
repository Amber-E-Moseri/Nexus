import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { zoomRedirectUri } from '../features/spaces/components/SpaceIntegrationsTab'

// Fixed OAuth redirect target for connecting a Zoom account to a space.
// Registered once as the Zoom Marketplace app's redirect URL — cannot vary
// per-space the way most of this app's URLs do (Zoom requires an exact match,
// unlike Google's whitelist). `state` carries the space_integrations row id
// created by SpaceIntegrationsTab's ZoomCard before redirecting here; the
// space to return to is recovered from that row, not from the URL.
export default function ZoomOAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)
  // Authorization codes are single-use — guard against the effect re-firing
  // when the profile object reference changes after the initial auth load.
  const exchangeStarted = useRef(false)

  useEffect(() => {
    if (!profile?.id) return
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    async function handleCallback() {
      try {
        const code = searchParams.get('code')
        const integrationId = searchParams.get('state')
        if (!code || !integrationId) {
          throw new Error(searchParams.get('error') || 'No authorization code received')
        }

        const { data: { session } } = await supabase.auth.getSession()
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(
          `${supabaseUrl}/functions/v1/space-integrations?action=connect-zoom&integration_id=${encodeURIComponent(integrationId)}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(zoomRedirectUri())}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          },
        )
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error || 'Failed to connect Zoom')

        const { data: integration } = await supabase
          .from('space_integrations')
          .select('department_id')
          .eq('id', integrationId)
          .single()

        setStatus('success')
        setTimeout(() => {
          navigate(integration?.department_id ? `/spaces/${integration.department_id}?action=integrations` : '/')
        }, 1500)
      } catch (err) {
        setStatus('error')
        setError(err.message)
      }
    }

    handleCallback()
  }, [searchParams, profile, navigate])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' }}>
      <div style={{ borderRadius: '16px', border: '1px solid var(--border)', backgroundColor: 'white', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '360px', width: '100%' }}>
        {status === 'processing' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid #BFDBFE', borderTopColor: '#2563EB', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>Connecting Zoom</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Finishing setup…</p>
          </div>
        )}
        {status === 'success' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>✓</div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: '#15803D', margin: 0 }}>Connected!</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Redirecting back to your space…</p>
          </div>
        )}
        {status === 'error' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ margin: '0 auto', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>✕</div>
            <p style={{ fontWeight: 600, fontSize: '16px', color: '#B91C1C', margin: 0 }}>Connection Failed</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{error}</p>
            <button
              onClick={() => navigate('/')}
              style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
            >
              Back home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
