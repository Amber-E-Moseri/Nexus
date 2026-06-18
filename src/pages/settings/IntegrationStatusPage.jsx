import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function ZoomConfigModal({ isOpen, onClose, onSave, saving, spaceId }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [message, setMessage] = useState('')
  const [vaultStatus, setVaultStatus] = useState(null) // null = loading, 'vault' = in vault, 'plaintext' = not in vault

  useEffect(() => {
    if (isOpen) {
      setClientId('')
      setClientSecret('')
      setMessage('')
      checkVaultStatus()
    }
  }, [isOpen])

  async function checkVaultStatus() {
    const { data } = await supabase
      .from('space_integrations')
      .select('id')
      .eq('department_id', spaceId)
      .eq('integration_type', 'zoom')
      .eq('is_active', true)
      .maybeSingle()

    if (data?.id) {
      const { data: secrets } = await supabase
        .from('space_integration_secrets')
        .select('secret_type')
        .eq('integration_id', data.id)
        .maybeSingle()

      setVaultStatus(secrets?.secret_type === 'vault' ? 'vault' : 'plaintext')
    } else {
      setVaultStatus(null)
    }
  }

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setMessage('Please enter both Client ID and Client Secret.')
      return
    }

    setMessage('')
    await onSave({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
    setClientId('')
    setClientSecret('')
  }

  if (!isOpen) return null

  const modalOverlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  }

  const modalContent = {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '90%',
    border: '1px solid var(--border)',
  }

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    color: 'var(--text)',
    background: '#FFFFFF',
    marginBottom: 12,
    boxSizing: 'border-box',
  }

  const btn = {
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: '#FFFFFF',
    color: 'var(--text)',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }

  const primaryBtn = { ...btn, background: 'var(--primary)', color: '#FFFFFF', border: 'none' }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Configure Zoom</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase' }}>
            Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="zoom_client_id_xyz"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase' }}>
            Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        {vaultStatus && (
          <div style={{ fontSize: 12, color: '#8B5CF6', marginBottom: 12, padding: '8px 12px', background: '#F3E8FF', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{vaultStatus === 'vault' ? '🔒' : '⚠️'}</span>
            <span>{vaultStatus === 'vault' ? 'Stored in Vault' : 'Not yet in Vault'}</span>
          </div>
        )}

        {message && (
          <div style={{ fontSize: 12, color: '#C94830', marginBottom: 12 }}>{message}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={primaryBtn}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IntegrationCard({ integration, onConfigure, configuring }) {
  const getStatusBadge = () => {
    const style = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6 }

    if (integration.is_active && integration.hasSecrets) {
      return <span style={{ ...style, color: '#16A34A', background: '#DCFCE7' }}>✅ Connected</span>
    } else if (integration.is_active && !integration.hasSecrets && integration.integration_type === 'zoom') {
      return <span style={{ ...style, color: '#EA580C', background: '#FEDBA9' }}>⚠️ Partial</span>
    }
    return <span style={{ ...style, color: '#9E9488', background: '#F5F1EA' }}>○ Not connected</span>
  }

  const getActionButton = () => {
    const style = { borderRadius: 8, border: '1px solid var(--border)', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#FFFFFF', color: 'var(--text)' }
    const primaryStyle = { ...style, background: 'var(--primary)', color: '#FFFFFF', border: 'none' }

    switch (integration.integration_type) {
      case 'zoom':
        return (
          <button type="button" onClick={onConfigure} disabled={configuring} style={primaryStyle}>
            {configuring ? 'Saving…' : 'Configure'}
          </button>
        )
      case 'google_drive':
        return <span style={{ fontSize: 12, color: 'var(--muted)' }}>API key only</span>
      case 'resend':
        return <span style={{ fontSize: 12, color: 'var(--muted)' }}>Connected</span>
      default:
        return <span style={{ fontSize: 12, color: 'var(--muted)' }}>Coming soon</span>
    }
  }

  const iconMap = {
    zoom: '🎥',
    google_drive: '📁',
    resend: '📧',
  }

  const cardStyle = {
    background: '#FFFFFF',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 24 }}>{iconMap[integration.integration_type] || '🔗'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{integration.display_name || integration.integration_type}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{integration.description || 'Integration'}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>{getStatusBadge()}</div>

      {integration.last_synced_at && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          Last used: {new Date(integration.last_synced_at).toLocaleDateString()}
        </div>
      )}

      <div>{getActionButton()}</div>
    </div>
  )
}

export default function IntegrationStatusPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [showZoomModal, setShowZoomModal] = useState(false)
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)

  useEffect(() => {
    if (profile?.role !== 'super_admin') {
      navigate('/settings')
      return
    }

    loadIntegrations()
  }, [profile])

  async function loadIntegrations() {
    setLoading(true)
    try {
      const { data: integrationRows, error: intError } = await supabase
        .from('space_integrations')
        .select('*')
        .order('created_at', { ascending: false })

      if (intError) throw intError

      // Check which have secrets
      const enriched = await Promise.all(
        (integrationRows || []).map(async (row) => {
          const { data: secrets } = await supabase
            .from('space_integration_secrets')
            .select('id')
            .eq('integration_id', row.id)
            .limit(1)

          return {
            ...row,
            hasSecrets: Boolean(secrets?.length),
          }
        })
      )

      setIntegrations(enriched)
    } finally {
      setLoading(false)
    }
  }

  async function handleZoomSave({ clientId, clientSecret }) {
    setConfiguring(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/store-vault-secret`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integration_type: 'zoom',
            space_id: selectedSpaceId,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        alert(`Error: ${error.error}`)
        return
      }

      setShowZoomModal(false)
      await loadIntegrations()
    } catch (err) {
      alert(`Failed to save Zoom credentials: ${String(err)}`)
    } finally {
      setConfiguring(false)
    }
  }

  const pageStyle = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '20px 24px',
  }

  const headerStyle = {
    marginBottom: 24,
  }

  const titleStyle = {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 8,
  }

  const subtitleStyle = {
    fontSize: 14,
    color: 'var(--muted)',
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Integrations</h1>
        <p style={subtitleStyle}>Manage and monitor connected services.</p>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>Loading integrations…</div>
      ) : integrations.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>No integrations configured yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={() => {
                setSelectedSpaceId(integration.department_id)
                setShowZoomModal(true)
              }}
              configuring={configuring && selectedSpaceId === integration.department_id}
            />
          ))}
        </div>
      )}

      <ZoomConfigModal
        isOpen={showZoomModal}
        onClose={() => setShowZoomModal(false)}
        onSave={handleZoomSave}
        saving={configuring}
        spaceId={selectedSpaceId}
      />
    </div>
  )
}
