// User Integrations Library
// Centralized exports for integration functionality

export {
  connectUserIntegration,
  getUserIntegrations,
  getUserIntegration,
  getUserIntegrationByType,
  updateUserIntegration,
  verifyUserIntegration,
  disconnectUserIntegration,
  deleteUserIntegration,
  logIntegrationActivity,
  getIntegrationActivity,
  enableIntegrationSync,
  disableIntegrationSync,
  recordIntegrationSync,
  getIntegrationSyncLogs,
  refreshUserIntegrationToken,
  checkTokenExpiry,
  updateIntegrationSettings,
  getIntegrationSettings,
  setupGoogleCalendarIntegration,
  setupSlackIntegration,
  setupEmailIntegration,
  setupZapierIntegration,
} from './api'

// Integration type definitions
export const INTEGRATION_TYPES = {
  google_calendar: {
    label: 'Google Calendar',
    icon: '📅',
    color: '#4285F4',
    requiresOAuth: true,
    supportsSync: true,
  },
  outlook_calendar: {
    label: 'Outlook Calendar',
    icon: '📆',
    color: '#0078D4',
    requiresOAuth: true,
    supportsSync: true,
  },
  slack: {
    label: 'Slack',
    icon: '💬',
    color: '#36C5F0',
    requiresOAuth: true,
    supportsSync: true,
  },
  teams: {
    label: 'Microsoft Teams',
    icon: '🤝',
    color: '#5B5FC7',
    requiresOAuth: true,
    supportsSync: true,
  },
  email_forward: {
    label: 'Email Forwarding',
    icon: '✉️',
    color: '#EA4335',
    requiresOAuth: false,
    supportsSync: false,
  },
  zapier: {
    label: 'Zapier',
    icon: '⚡',
    color: '#FF6B00',
    requiresOAuth: false,
    supportsSync: false,
  },
  ifttt: {
    label: 'IFTTT',
    icon: '🔗',
    color: '#00AFD8',
    requiresOAuth: false,
    supportsSync: false,
  },
  custom: {
    label: 'Custom Integration',
    icon: '🔌',
    color: '#6366F1',
    requiresOAuth: false,
    supportsSync: true,
  },
}

// Helper to get integration config
export function getIntegrationConfig(type) {
  return INTEGRATION_TYPES[type] || INTEGRATION_TYPES.custom
}

// Helper to get all OAuth integration types
export function getOAuthIntegrationTypes() {
  return Object.entries(INTEGRATION_TYPES)
    .filter(([_, config]) => config.requiresOAuth)
    .map(([type, _]) => type)
}

// Helper to get all form-based integration types
export function getFormIntegrationTypes() {
  return Object.entries(INTEGRATION_TYPES)
    .filter(([_, config]) => !config.requiresOAuth)
    .map(([type, _]) => type)
}

// Helper to check if integration type supports syncing
export function supportsSync(type) {
  return INTEGRATION_TYPES[type]?.supportsSync || false
}

// Helper to get OAuth redirect URL
export function getOAuthRedirectUrl(type) {
  const baseUrl = window.location.origin
  const slugs = {
    google_calendar: 'google_calendar',
    outlook_calendar: 'outlook_calendar',
    slack: 'slack',
    teams: 'teams',
  }
  const slug = slugs[type]
  return slug ? `${baseUrl}/auth/${slug}-callback` : null
}
