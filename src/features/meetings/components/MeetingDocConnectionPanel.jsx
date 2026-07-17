import { useEffect, useState } from 'react'
import {
  getMeetingDocConnectOAuthUrl,
  getMeetingDocConnectionStatus,
  disconnectMeetingDoc,
} from '../lib/meetingDocConnection'

const FS = {
  navy:    '#18122E',
  purple:  '#4C2A92',
  sage:    '#2D8653',
  sageL:   'rgba(45,134,83,.12)',
  border:  '#E5DDD0',
  borderL: '#EDE8DC',
  surface: '#FFFFFF',
  bg:      'var(--bg-app)',
  text:    '#1C1C1C',
  muted:   '#7A6F5E',
  xmuted:  '#B0A89A',
  coral:   '#C73B2B',
  coralL:  '#FEE8E6',
}

export default function MeetingDocConnectionPanel() {
  const [status, setStatus] = useState(null) // null=loading, {connected,needs_reauth,...}
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const s = await getMeetingDocConnectionStatus()
      setStatus(s)
    } catch (err) {
      console.error('[MeetingDocConnectionPanel] status error:', err)
      setStatus({ connected: false })
    }
  }

  useEffect(() => { load() }, [])

  function handleConnect() {
    window.location.href = getMeetingDocConnectOAuthUrl()
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Google Drive for meeting docs? The "Save to Drive" button will stop working until you reconnect.')) return
    setDisconnecting(true)
    setError('')
    try {
      await disconnectMeetingDoc()
      await load()
    } catch (err) {
      setError(err.message || 'Disconnect failed')
    } finally {
      setDisconnecting(false)
    }
  }

  const card = {
    background:   FS.surface,
    border:       `1px solid ${FS.borderL}`,
    borderRadius: 12,
    padding:      '18px 20px',
    display:      'flex',
    flexDirection: 'column',
    gap:          12,
  }

  const label = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: FS.muted }
  const btn = (bg, color, border) => ({
    padding:    '8px 16px',
    borderRadius: 8,
    border:     border ?? 'none',
    background: bg,
    color,
    fontFamily: 'inherit',
    fontSize:   12,
    fontWeight: 700,
    cursor:     'pointer',
  })

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: FS.navy, margin: 0 }}>Meeting Docs Drive</h2>
        <p style={{ fontSize: 12, color: FS.muted, marginTop: 3, marginBottom: 0 }}>
          Google Drive connection used by the "Save to Drive" button on meeting detail pages.
          Connect a Google account to enable automatic upload of meeting minutes as Google Docs.
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: FS.coralL, color: FS.coral, fontSize: 12 }}>
          {error}
        </div>
      )}

      {status === null && (
        <div style={{ ...card }}>
          <span style={{ fontSize: 13, color: FS.xmuted }}>Checking connection…</span>
        </div>
      )}

      {status && !status.connected && (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: FS.xmuted, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: FS.muted }}>Not connected</span>
          </div>
          <p style={{ fontSize: 12, color: FS.xmuted, margin: 0 }}>
            Click below to authorize Nexus to create Google Docs in your Drive.
            You'll be redirected to Google and back.
          </p>
          <div>
            <button onClick={handleConnect} style={btn(FS.purple, '#fff')}>
              🔗 Connect Google Drive
            </button>
          </div>
        </div>
      )}

      {status?.connected && (
        <div style={{ ...card }}>
          {status.needs_reauth ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>Needs reconnection</span>
              </div>
              <p style={{ fontSize: 12, color: FS.muted, margin: 0 }}>
                The Google access token has expired or been revoked. Reconnect to resume doc uploads.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleConnect} style={btn('#F59E0B', '#fff')}>
                  🔄 Reconnect Google Drive
                </button>
                <button onClick={handleDisconnect} disabled={disconnecting} style={btn('transparent', FS.coral, `1px solid ${FS.coral}`)}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: FS.sage, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: FS.sage, fontWeight: 600 }}>Connected</span>
              </div>
              {status.connected_since && (
                <div>
                  <span style={label}>Connected since</span>
                  <div style={{ fontSize: 13, color: FS.text, marginTop: 3 }}>
                    {new Date(status.connected_since).toLocaleDateString()}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleConnect} style={btn('transparent', FS.purple, `1px solid ${FS.border}`)}>
                  🔄 Reconnect
                </button>
                <button onClick={handleDisconnect} disabled={disconnecting} style={btn('transparent', FS.coral, `1px solid ${FS.coral}`)}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <p style={{ fontSize: 11, color: FS.xmuted, marginTop: 8, marginBottom: 0 }}>
        You'll need to add <code style={{ fontSize: 11 }}>{window.location.origin}/auth/meeting-doc-callback</code> as
        an authorized redirect URI in your Google OAuth app if it isn't already.
      </p>
    </div>
  )
}
