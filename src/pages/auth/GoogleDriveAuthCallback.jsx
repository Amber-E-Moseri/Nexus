import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function GoogleDriveAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState(null)

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setError(`Google OAuth error: ${errorParam}`)
        setTimeout(() => navigate('/settings/integrations'), 3000)
        return
      }

      if (!code || !state) {
        setError('Missing authorization code or state')
        setTimeout(() => navigate('/settings/integrations'), 3000)
        return
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const { data: { session } } = await supabase.auth.getSession()

        const response = await fetch(
          `${supabaseUrl}/functions/v1/google-drive-auth?action=callback&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        )

        if (!response.ok) {
          const errorData = await response.json()
          setError(`Failed to connect Google Drive: ${errorData.error}`)
          setTimeout(() => navigate('/settings/integrations'), 3000)
          return
        }

        const result = await response.json()
        if (result.redirect_url) {
          window.location.href = result.redirect_url
        } else {
          navigate('/settings/integrations?connected=google_drive')
        }
      } catch (err) {
        setError(`Connection error: ${String(err)}`)
        setTimeout(() => navigate('/settings/integrations'), 3000)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#F4F1EA',
    padding: 20,
  }

  const cardStyle = {
    background: 'white',
    border: '1px solid #EDE8DC',
    borderRadius: 16,
    padding: 40,
    maxWidth: 400,
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  }

  const spinnerStyle = {
    width: 40,
    height: 40,
    border: '3px solid #EDE8DC',
    borderTopColor: '#4C2A92',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={containerStyle}>
        <div style={cardStyle}>
          {error ? (
            <>
              <div style={{ fontSize: 24, marginBottom: 12 }}>❌</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2D2A22', marginBottom: 8 }}>
                Connection Failed
              </h1>
              <p style={{ fontSize: 14, color: '#9E9488', marginBottom: 16 }}>
                {error}
              </p>
              <p style={{ fontSize: 12, color: '#9E9488' }}>
                Redirecting to settings...
              </p>
            </>
          ) : (
            <>
              <div style={spinnerStyle}></div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2D2A22', marginBottom: 8 }}>
                Connecting Google Drive
              </h1>
              <p style={{ fontSize: 14, color: '#9E9488' }}>
                Please wait while we complete the authorization...
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
