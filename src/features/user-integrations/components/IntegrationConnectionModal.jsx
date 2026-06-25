import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { connectUserIntegration } from '../../../lib/user-integrations/api'
import { useAuth } from '../../../hooks/useAuth'

const INTEGRATION_CONFIGS = {
  google_calendar: {
    name: 'Google Calendar',
    description: 'Sync your personal Google Calendar with this workspace',
    requiresOAuth: true,
    fields: [],
    icon: '📅',
  },
  outlook_calendar: {
    name: 'Outlook Calendar',
    description: 'Sync your Outlook calendar with this workspace',
    requiresOAuth: true,
    fields: [],
    icon: '📆',
  },
  slack: {
    name: 'Slack',
    description: 'Get notifications in your Slack workspace',
    requiresOAuth: true,
    fields: [],
    icon: '💬',
  },
  teams: {
    name: 'Microsoft Teams',
    description: 'Get notifications in Microsoft Teams',
    requiresOAuth: true,
    fields: [],
    icon: '🤝',
  },
  email_forward: {
    name: 'Email Forwarding',
    description: 'Forward notifications to your email',
    requiresOAuth: false,
    fields: [{ name: 'email', label: 'Email Address', type: 'email', required: true }],
    icon: '✉️',
  },
  zapier: {
    name: 'Zapier',
    description: 'Connect to Zapier for automation',
    requiresOAuth: false,
    fields: [{ name: 'api_key', label: 'Zapier API Key', type: 'password', required: true }],
    icon: '⚡',
  },
  ifttt: {
    name: 'IFTTT',
    description: 'Create automations with IFTTT',
    requiresOAuth: false,
    fields: [{ name: 'api_key', label: 'IFTTT API Key', type: 'password', required: true }],
    icon: '🔗',
  },
}

function OAuthIntegrationFlow({ integrationType, onSuccess, onError }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleOAuthConnect() {
    setLoading(true)

    // In a real implementation, this would redirect to OAuth provider
    // For now, we'll show a placeholder
    const oauthUrl = getOAuthUrl(integrationType, profile.id)
    window.location.href = oauthUrl
  }

  function getOAuthUrl(type, userId) {
    const baseUrl = window.location.origin

    // Map integration types to callback URL paths
    const callbackPaths = {
      google_calendar: '/auth/google_calendar-callback',
      outlook_calendar: '/auth/outlook_calendar-callback',
      slack: '/auth/slack-callback',
      teams: '/auth/teams-callback',
    }

    const redirectUri = `${baseUrl}${callbackPaths[type]}`

    const configs = {
      google_calendar: `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${
        import.meta.env.VITE_GOOGLE_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/calendar&state=${userId}`,

      outlook_calendar: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${
        import.meta.env.VITE_MICROSOFT_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=Calendars.ReadWrite&state=${userId}`,

      slack: `https://slack.com/oauth/v2/authorize?client_id=${import.meta.env.VITE_SLACK_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=chat:write,users:read&state=${userId}`,

      teams: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${
        import.meta.env.VITE_TEAMS_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://graph.microsoft.com/Team.ReadWrite&state=${userId}`,
    }

    return configs[type]
  }

  const config = INTEGRATION_CONFIGS[integrationType]

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="flex gap-3">
          <AlertCircle size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">Sign in with {config.name}</p>
            <p className="mt-1">You'll be redirected to {config.name} to authorize access.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <p className="font-medium text-[var(--text-primary)]">Permissions requested:</p>
        <ul className="space-y-2 text-[var(--text-secondary)]">
          {integrationType.includes('calendar') && (
            <>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                Read and write access to your calendar
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                Event details and availability
              </li>
            </>
          )}
          {integrationType === 'slack' && (
            <>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                Send messages to your workspace
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                View user information
              </li>
            </>
          )}
          {integrationType === 'teams' && (
            <>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                Send messages to Teams
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                Access Teams resources
              </li>
            </>
          )}
        </ul>
      </div>

      <button
        onClick={handleOAuthConnect}
        disabled={loading}
        className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={18} className="animate-spin" />}
        {loading ? 'Redirecting...' : `Continue with ${config.name}`}
      </button>
    </div>
  )
}

function FormIntegrationFlow({ integrationType, onSuccess, onError }) {
  const { profile } = useAuth()
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const config = INTEGRATION_CONFIGS[integrationType]

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Validate required fields
      for (const field of config.fields) {
        if (field.required && !formData[field.name]?.trim()) {
          setError(`${field.label} is required`)
          setLoading(false)
          return
        }
      }

      // Prepare payload
      const payload = {
        user_id: profile.id,
        integration_type: integrationType,
        integration_name: formData.email || formData.api_key || integrationType,
        settings: {},
      }

      // Add type-specific fields
      if (integrationType === 'email_forward') {
        payload.integration_name = formData.email
        payload.settings.email = formData.email
      } else if (integrationType === 'zapier') {
        payload.oauth_token = formData.api_key
        payload.settings.api_key = formData.api_key
      } else if (integrationType === 'ifttt') {
        payload.oauth_token = formData.api_key
        payload.settings.api_key = formData.api_key
      }

      const newIntegration = await connectUserIntegration(payload)
      onSuccess(newIntegration)
    } catch (err) {
      setError(err.message || 'Failed to connect integration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 flex gap-3">
          <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {config.fields.map((field) => (
          <label key={field.name} className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </span>
            <input
              type={field.type}
              value={formData[field.name] || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              placeholder={field.label}
              disabled={loading}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={18} className="animate-spin" />}
        {loading ? 'Connecting...' : 'Connect Integration'}
      </button>
    </form>
  )
}

export default function IntegrationConnectionModal({ isOpen, integrationType, onClose, onSuccess }) {
  const config = integrationType ? INTEGRATION_CONFIGS[integrationType] : null

  function handleSuccess(newIntegration) {
    onSuccess(newIntegration)
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.45)]" />
        <Dialog.Content className="fixed inset-y-6 left-1/2 z-50 flex w-[min(500px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
            <div className="flex items-center gap-3">
              {config && <span className="text-3xl">{config.icon}</span>}
              <div>
                <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
                  {config?.name}
                </Dialog.Title>
                <p className="text-sm text-[var(--text-secondary)]">{config?.description}</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-lg p-2 hover:bg-[var(--surface-hover)]">
                <X size={20} className="text-[var(--text-secondary)]" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {integrationType && config ? (
              config.requiresOAuth ? (
                <OAuthIntegrationFlow
                  integrationType={integrationType}
                  onSuccess={handleSuccess}
                  onError={() => {}}
                />
              ) : (
                <FormIntegrationFlow
                  integrationType={integrationType}
                  onSuccess={handleSuccess}
                  onError={() => {}}
                />
              )
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
