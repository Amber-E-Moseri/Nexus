import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, Link2 } from 'lucide-react'
import {
  getUserIntegrations,
  disconnectUserIntegration,
  enableIntegrationSync,
  disableIntegrationSync,
  getIntegrationActivity,
} from '../../../lib/user-integrations/api'
import { useAuth } from '../../../hooks/useAuth'
import IntegrationConnectionModal from './IntegrationConnectionModal'

const INTEGRATION_TYPES = {
  google_calendar: {
    name: '📅 Google Calendar',
    description: 'Sync your personal Google Calendar',
    icon: '📅',
    color: '#4285F4',
  },
  outlook_calendar: {
    name: '📆 Outlook Calendar',
    description: 'Sync your Outlook calendar',
    icon: '📆',
    color: '#0078D4',
  },
  slack: {
    name: '💬 Slack',
    description: 'Get notifications in Slack',
    icon: '💬',
    color: '#36C5F0',
  },
  teams: {
    name: '🤝 Microsoft Teams',
    description: 'Get notifications in Teams',
    icon: '🤝',
    color: '#5B5FC7',
  },
  email_forward: {
    name: '✉️ Email Forwarding',
    description: 'Forward notifications to email',
    icon: '✉️',
    color: '#EA4335',
  },
  zapier: {
    name: '⚡ Zapier',
    description: 'Connect to Zapier for automation',
    icon: '⚡',
    color: '#FF6B00',
  },
  ifttt: {
    name: '🔗 IFTTT',
    description: 'Create automations with IFTTT',
    icon: '🔗',
    color: '#00AFD8',
  },
}

export default function UserIntegrationsManager() {
  const { profile } = useAuth()
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIntegration, setSelectedIntegration] = useState(null)
  const [showActivityLog, setShowActivityLog] = useState(null)
  const [activityLog, setActivityLog] = useState([])
  const [removing, setRemoving] = useState(null)

  useEffect(() => {
    loadIntegrations()
  }, [profile?.id])

  async function loadIntegrations() {
    if (!profile?.id) return
    try {
      setLoading(true)
      const data = await getUserIntegrations(profile.id)
      setIntegrations(data)
    } catch (err) {
      console.error('Failed to load integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect(integrationId) {
    if (!window.confirm('Disconnect this integration?')) return

    try {
      setRemoving(integrationId)
      await disconnectUserIntegration(integrationId)
      await loadIntegrations()
    } catch (err) {
      alert(`Failed to disconnect: ${err.message}`)
    } finally {
      setRemoving(null)
    }
  }

  async function handleToggleSync(integrationId, currentSync) {
    try {
      if (currentSync) {
        await disableIntegrationSync(integrationId)
      } else {
        await enableIntegrationSync(integrationId, 'both')
      }
      await loadIntegrations()
    } catch (err) {
      alert(`Failed to toggle sync: ${err.message}`)
    }
  }

  async function loadActivityLog(integrationId) {
    try {
      const logs = await getIntegrationActivity(integrationId)
      setActivityLog(logs)
      setShowActivityLog(integrationId)
    } catch (err) {
      console.error('Failed to load activity:', err)
    }
  }

  function handleConnectionSuccess(newIntegration) {
    loadIntegrations()
  }

  if (loading) {
    return <div className="p-8 text-center text-[var(--text-secondary)]">Loading integrations...</div>
  }

  const activeIntegrations = integrations.filter((i) => i.is_active)
  const connectedTypes = new Set(activeIntegrations.map((i) => i.integration_type))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">🔌 Personal Integrations</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Connect your personal accounts and services to enhance your workflow
          </p>
        </div>
      </div>

      {/* Connected Integrations */}
      {activeIntegrations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Connected</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {activeIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="rounded-lg border border-[var(--border)] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {INTEGRATION_TYPES[integration.integration_type]?.icon || '🔌'}
                      </span>
                      <div>
                        <h4 className="font-medium text-[var(--text-primary)]">
                          {INTEGRATION_TYPES[integration.integration_type]?.name || integration.integration_name}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Connected {new Date(integration.connected_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Status indicators */}
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        {integration.is_verified ? (
                          <>
                            <CheckCircle2 size={14} className="text-green-600" />
                            <span className="text-green-700">Verified</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} className="text-amber-600" />
                            <span className="text-amber-700">Pending verification</span>
                          </>
                        )}
                      </div>

                      {integration.sync_enabled && (
                        <div className="flex items-center gap-2 text-xs">
                          <RefreshCw size={14} className="text-blue-600" />
                          <span className="text-blue-700">
                            Sync: {integration.sync_direction === 'both' ? '↔️ Two-way' : integration.sync_direction === 'to_external' ? '→ Send' : '← Receive'}
                          </span>
                          {integration.last_sync_at && (
                            <span className="text-[var(--text-tertiary)]">
                              (Last: {new Date(integration.last_sync_at).toLocaleTimeString()})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="rounded-lg p-2 hover:bg-[var(--surface-hover)]"
                        aria-label="Integration options"
                      >
                        <MoreVertical size={16} className="text-[var(--text-secondary)]" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        side="bottom"
                        align="end"
                        className="min-w-[180px] rounded-lg border border-[var(--border)] bg-white shadow-lg"
                        style={{ zIndex: 50 }}
                      >
                        <DropdownMenu.Item
                          onSelect={() => handleToggleSync(integration.id, integration.sync_enabled)}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        >
                          <RefreshCw size={14} />
                          <span>{integration.sync_enabled ? 'Disable Sync' : 'Enable Sync'}</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                          onSelect={() => loadActivityLog(integration.id)}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        >
                          <span>📋</span>
                          <span>View Activity</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Separator className="my-1 border-t border-[var(--border)]" />

                        <DropdownMenu.Item
                          onSelect={() => handleDisconnect(integration.id)}
                          disabled={removing === integration.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          <span>{removing === integration.id ? 'Disconnecting...' : 'Disconnect'}</span>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Available</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(INTEGRATION_TYPES)
            .filter(([type]) => !connectedTypes.has(type))
            .map(([type, info]) => (
              <button
                key={type}
                onClick={() => setSelectedIntegration(type)}
                className="group rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-hover)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:bg-opacity-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                      {info.name}
                    </h4>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{info.description}</p>
                  </div>
                  <Plus size={16} className="shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--accent)]" />
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Connection Modal */}
      <IntegrationConnectionModal
        isOpen={!!selectedIntegration}
        integrationType={selectedIntegration}
        onClose={() => setSelectedIntegration(null)}
        onSuccess={handleConnectionSuccess}
      />

      {/* Activity Log Modal */}
      {showActivityLog && (
        <Dialog.Root open={!!showActivityLog} onOpenChange={() => setShowActivityLog(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.45)]" />
            <Dialog.Content className="fixed inset-y-6 left-1/2 z-50 flex w-[min(600px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-lg">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
                  Integration Activity
                </Dialog.Title>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {activityLog.length === 0 ? (
                  <div className="text-center text-[var(--text-secondary)]">No activity yet</div>
                ) : (
                  <div className="space-y-3">
                    {activityLog.map((log) => (
                      <div key={log.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-[var(--text-primary)] capitalize">
                              {log.action.replace(/_/g, ' ')}
                            </div>
                            <div className="mt-1 text-xs text-[var(--text-secondary)]">
                              {new Date(log.created_at).toLocaleString()}
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              log.status === 'success'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                        {log.error_message && (
                          <div className="mt-2 text-xs text-red-600">{log.error_message}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border)] px-5 py-4">
                <button
                  onClick={() => setShowActivityLog(null)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Info Box */}
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">💡 Personal integrations are private to you</p>
        <p className="mt-1 text-xs">Your integration tokens are encrypted and only accessible to you. Admins cannot see your personal credentials.</p>
      </div>
    </div>
  )
}
