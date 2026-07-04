import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuth } from '../../../hooks/useAuth'
import { requestIntegration } from '../index'

const INTEGRATION_TYPES = [
  { value: 'google_drive', label: 'Google Drive' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'foundation_school', label: 'Foundation School' },
  { value: 'canva', label: 'Canva' },
  { value: 'custom', label: 'Custom Integration' },
]

export default function IntegrationRequestModal({ open, onOpenChange, departmentId, onSuccess }) {
  const { user, profile } = useAuth()
  const [integrationType, setIntegrationType] = useState('custom')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!displayName.trim()) {
      setError('Integration name is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await requestIntegration({
        departmentId,
        integrationType,
        displayName: displayName.trim(),
        description: description.trim() || null,
        requestedByName: profile?.name || user?.email || 'Unknown',
        requestedByEmail: user?.email,
      })

      setIntegrationType('custom')
      setDisplayName('')
      setDescription('')
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err.message || 'Failed to request integration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,14,30,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(480px, 95vw)',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Request Integration
            </Dialog.Title>
            <Dialog.Close
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                fontSize: 20,
              }}
            >
              ×
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Integration Type
                </span>
                <select
                  value={integrationType}
                  onChange={(e) => setIntegrationType(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                >
                  {INTEGRATION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Integration Name
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Team Zoom Account"
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Why do you need this?
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us what you'll use this integration for..."
                  rows={4}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </label>

              {error && (
                <div style={{ fontSize: 12, color: '#C94830', padding: '8px 12px', background: '#FEE2E2', borderRadius: 8 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: 10,
                    background: 'var(--accent)',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Requesting...' : 'Request Integration'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
