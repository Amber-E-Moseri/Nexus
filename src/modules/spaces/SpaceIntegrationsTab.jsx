import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Google Drive Card ─────────────────────────────────────────────────────────

function GoogleDriveCard({ spaceId, canManage }) {
  const { profile } = useAuth()
  const [integration, setIntegration] = useState(undefined) // undefined = loading
  const [isEnabled, setIsEnabled] = useState(true)
  const [files, setFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [connectMode, setConnectMode] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')

  async function loadIntegration() {
    const { data } = await supabase
      .from('space_integrations')
      .select('*')
      .eq('department_id', spaceId)
      .eq('integration_type', 'google_drive')
      .maybeSingle()

    if (data) {
      setIsEnabled(data.is_active)
      if (data.is_active) {
        setIntegration(data)
      } else {
        setIntegration(null)
      }
    } else {
      setIntegration(null)
    }
  }

  async function loadFiles(integrationId) {
    setFilesLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('space-integrations', {
        method: 'GET',
        headers: {},
        body: null,
      })
      // The edge function is GET-only for drive-files; use fetch directly
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${supabaseUrl}/functions/v1/space-integrations?action=drive-files&integration_id=${integrationId}`,
        { headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
      )
      if (res.ok) {
        const json = await res.json()
        setFiles(json.files ?? [])
      }
    } finally {
      setFilesLoading(false)
    }
  }

  useEffect(() => {
    loadIntegration()
  }, [spaceId])

  useEffect(() => {
    if (integration?.id) loadFiles(integration.id)
  }, [integration?.id])

  function parseFolderId(url) {
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    return match ? match[1] : null
  }

  async function handleConnect() {
    if (!folderUrl.trim()) { setMessage('Please enter a folder URL.'); return }
    const folderId = parseFolderId(folderUrl)
    if (!folderId) { setMessage('Could not parse folder ID from URL.'); return }
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.from('space_integrations').upsert({
        department_id: spaceId,
        integration_type: 'google_drive',
        display_name: 'Google Drive',
        config: { folder_id: folderId, folder_url: folderUrl.trim() },
        is_active: true,
        connected_by: profile?.id,
      }, { onConflict: 'department_id,integration_type' })

      if (error) { setMessage(error.message); return }
      setConnectMode(false)
      setFolderUrl('')
      await loadIntegration()
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!integration?.id || !window.confirm('Disconnect Google Drive from this space?')) return
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(
      `${supabaseUrl}/functions/v1/space-integrations?action=disconnect&integration_id=${integration.id}`,
      { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
    )
    setIntegration(null)
    setFiles([])
  }

  async function handleRefresh() {
    if (!integration?.id) return
    setRefreshing(true)
    await loadFiles(integration.id)
    setRefreshing(false)
  }

  const cardStyle = { background: '#FFFFFF', border: '1px solid #EDE8DC', borderRadius: 14, padding: '18px 20px' }
  const btn = { borderRadius: 8, border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#2D2A22', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const primaryBtn = { ...btn, background: '#4C2A92', color: '#FFFFFF', border: 'none' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 22 }}>📁</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2D2A22' }}>Google Drive</div>
      </div>

      {integration === undefined ? (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Loading…</div>
      ) : integration ? (
        <>
          <div style={{ fontSize: 13, color: '#2D2A22', marginBottom: 10 }}>
            <span style={{ color: '#9E9488' }}>Folder: </span>
            <a href={integration.config?.folder_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4C2A92', fontWeight: 600 }}>
              {integration.config?.folder_id ?? 'Linked folder'} ↗
            </a>
          </div>

          {filesLoading ? (
            <div style={{ fontSize: 12, color: '#9E9488' }}>Loading files…</div>
          ) : files.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {files.map((file) => (
                <a
                  key={file.id}
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#2D2A22', textDecoration: 'none', padding: '6px 10px', borderRadius: 8, background: '#F9F7F3', border: '1px solid #EDE8DC' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.name}</span>
                  <span style={{ color: '#9E9488', flexShrink: 0, marginLeft: 10 }}>{formatDate(file.modifiedTime)}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9E9488', marginBottom: 10 }}>No files found in this folder.</div>
          )}

          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleRefresh} disabled={refreshing} style={btn}>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button type="button" onClick={handleDisconnect} style={{ ...btn, color: '#C94830', borderColor: '#F8D5CE' }}>
                Disconnect
              </button>
            </div>
          )}
        </>
      ) : !isEnabled ? (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Google Drive disabled for this space.</div>
      ) : canManage ? (
        connectMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#9E9488' }}>Paste your Google Drive folder URL:</div>
            <input
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              style={{ border: '1px solid #EDE8DC', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#2D2A22', background: '#FFFFFF' }}
            />
            {message ? <div style={{ fontSize: 12, color: '#C94830' }}>{message}</div> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleConnect} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save Folder'}</button>
              <button type="button" onClick={() => { setConnectMode(false); setMessage('') }} style={btn}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConnectMode(true)} style={primaryBtn}>Connect Google Drive</button>
        )
      ) : (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Google Drive not connected.</div>
      )}
    </div>
  )
}

// ── Zoom Card ─────────────────────────────────────────────────────────────────

function ZoomCard({ spaceId, canManage }) {
  const { profile } = useAuth()
  const [integration, setIntegration] = useState(undefined)
  const [isEnabled, setIsEnabled] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  async function loadIntegration() {
    const { data } = await supabase
      .from('space_integrations')
      .select('*')
      .eq('department_id', spaceId)
      .eq('integration_type', 'zoom')
      .maybeSingle()

    if (data) {
      setIsEnabled(data.is_active)
      if (data.is_active) {
        setIntegration(data)
      } else {
        setIntegration(null)
      }
    } else {
      setIntegration(null)
    }
  }

  useEffect(() => { loadIntegration() }, [spaceId])

  async function handleConnect() {
    // Zoom OAuth — requires server-side ZOOM_CLIENT_ID
    // Upsert a placeholder row so the card shows "connected" after the OAuth flow
    // In production, Zoom OAuth callback would update this row with real credentials.
    const { error } = await supabase.from('space_integrations').upsert({
      department_id: spaceId,
      integration_type: 'zoom',
      display_name: 'Zoom',
      config: { account_id: '', meeting_prefix: '' },
      is_active: true,
      connected_by: profile?.id,
    }, { onConflict: 'department_id,integration_type' })
    if (!error) await loadIntegration()
  }

  async function handleDisconnect() {
    if (!integration?.id || !window.confirm('Disconnect Zoom from this space?')) return
    setDisconnecting(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(
        `${supabaseUrl}/functions/v1/space-integrations?action=disconnect&integration_id=${integration.id}`,
        { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
      )
      setIntegration(null)
    } finally {
      setDisconnecting(false)
    }
  }

  function openZoomMeeting() {
    const prefix = integration?.config?.meeting_prefix || ''
    const url = `https://zoom.us/start/videomeeting?topic=${encodeURIComponent(prefix ? `${prefix} Meeting` : 'Meeting')}`
    window.open(url, '_blank')
  }

  const cardStyle = { background: '#FFFFFF', border: '1px solid #EDE8DC', borderRadius: 14, padding: '18px 20px' }
  const btn = { borderRadius: 8, border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#2D2A22', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const primaryBtn = { ...btn, background: '#2D8CFF', color: '#FFFFFF', border: 'none' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#2D8CFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: 14, fontWeight: 800 }}>Z</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2D2A22' }}>Zoom</div>
      </div>

      {integration === undefined ? (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Loading…</div>
      ) : integration ? (
        <>
          {integration.config?.account_id ? (
            <div style={{ fontSize: 12, color: '#9E9488', marginBottom: 10 }}>Account: {integration.config.account_id}</div>
          ) : null}
          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={openZoomMeeting} style={primaryBtn}>Create Meeting</button>
              <button type="button" onClick={handleDisconnect} disabled={disconnecting} style={{ ...btn, color: '#C94830', borderColor: '#F8D5CE' }}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          )}
        </>
      ) : !isEnabled ? (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Zoom disabled for this space.</div>
      ) : canManage ? (
        <button type="button" onClick={handleConnect} style={primaryBtn}>Connect Zoom</button>
      ) : (
        <div style={{ fontSize: 13, color: '#9E9488' }}>Zoom not connected.</div>
      )}
    </div>
  )
}

// ── Integration Toggle Panel ──────────────────────────────────────────────

function IntegrationTogglesPanel({ spaceId }) {
  const [toggles, setToggles] = useState({
    google_drive: true,
    zoom: true,
    resend: false,
  })
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    loadToggles()
  }, [spaceId])

  async function loadToggles() {
    const { data } = await supabase
      .from('space_integrations')
      .select('integration_type, is_active')
      .eq('department_id', spaceId)

    if (data) {
      const toggleState = { google_drive: true, zoom: true, resend: false }
      data.forEach((row) => {
        if (row.integration_type in toggleState) {
          toggleState[row.integration_type] = row.is_active
        }
      })
      setToggles(toggleState)
    }
  }

  async function handleToggle(integrationType, newValue) {
    setSaving(integrationType)
    try {
      const { error } = await supabase.from('space_integrations').upsert({
        department_id: spaceId,
        integration_type: integrationType,
        display_name: integrationType.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        config: {},
        is_active: newValue,
      }, { onConflict: 'department_id,integration_type' })

      if (!error) {
        setToggles((prev) => ({ ...prev, [integrationType]: newValue }))
      }
    } finally {
      setSaving(null)
    }
  }

  const panelStyle = { background: '#FFFFFF', border: '1px solid #EDE8DC', borderRadius: 14, padding: '18px 20px' }
  const labelStyle = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#2D2A22', marginBottom: 14 }}>Enable integrations for this space</div>

      <div style={labelStyle} onClick={() => handleToggle('google_drive', !toggles.google_drive)}>
        <input
          type="checkbox"
          checked={toggles.google_drive}
          onChange={(e) => e.stopPropagation()}
          disabled={saving === 'google_drive'}
          style={{ cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: '#2D2A22', fontWeight: 500 }}>📁 Google Drive</span>
      </div>

      <div style={labelStyle} onClick={() => handleToggle('zoom', !toggles.zoom)}>
        <input
          type="checkbox"
          checked={toggles.zoom}
          onChange={(e) => e.stopPropagation()}
          disabled={saving === 'zoom'}
          style={{ cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: '#2D2A22', fontWeight: 500 }}>🎥 Zoom</span>
      </div>

      <div style={labelStyle} onClick={() => handleToggle('resend', !toggles.resend)}>
        <input
          type="checkbox"
          checked={toggles.resend}
          onChange={(e) => e.stopPropagation()}
          disabled={saving === 'resend'}
          style={{ cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: '#2D2A22', fontWeight: 500 }}>📧 Email (Resend)</span>
      </div>
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function SpaceIntegrationsTab({ spaceId, canManage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2D2A22' }}>Space Integrations</div>
        <div style={{ fontSize: 13, color: '#9E9488', marginTop: 2 }}>Connect tools to this space to streamline your team's workflow.</div>
      </div>

      {canManage && <IntegrationTogglesPanel spaceId={spaceId} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        <GoogleDriveCard spaceId={spaceId} canManage={canManage} />
        <ZoomCard spaceId={spaceId} canManage={canManage} />
      </div>
    </div>
  )
}
