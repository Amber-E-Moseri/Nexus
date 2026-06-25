# Personal User Integrations Setup Guide

## Overview

The personal integrations system allows users to connect their own accounts and services (Google Calendar, Slack, email, etc.) to enhance their workflow. Unlike workspace integrations which are managed by admins, personal integrations are user-specific and encrypted.

## Architecture

### Database Schema

Three main tables store integration data:

- **user_integrations** — Core integration records with OAuth tokens and settings
- **user_integration_activity** — Audit log of all integration actions
- **user_integration_logs** — Detailed sync logs for integrations that perform syncing

All tables have RLS (Row Level Security) policies that ensure users can only access their own integrations.

### Key Features

- **OAuth Support** — Google Calendar, Outlook Calendar, Slack, Microsoft Teams
- **Form-based** — Email forwarding, Zapier API key, IFTTT API key
- **Token Management** — Automatic refresh token handling and expiry checking
- **Sync Configuration** — Bidirectional or unidirectional sync support
- **Activity Logging** — Complete audit trail of all integration events

## UI Components

### `UserIntegrationsManager.jsx`

Main component displaying:
- List of connected integrations with status indicators
- Available integrations to connect
- Integration management actions (disconnect, toggle sync, view activity)

### `IntegrationConnectionModal.jsx`

Modal that handles:
- OAuth flow for OAuth integrations (redirects to provider)
- Form submission for API key integrations
- Error handling and user feedback

## OAuth Integration Setup

### Required Environment Variables

Add these to `.env.local`:

```env
# Google Calendar
VITE_GOOGLE_CLIENT_ID=your_google_client_id

# Microsoft (Outlook Calendar & Teams)
VITE_MICROSOFT_CLIENT_ID=your_microsoft_client_id

# Slack
VITE_SLACK_CLIENT_ID=your_slack_client_id
```

### OAuth Provider Configuration

#### Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Calendar API
4. Create an OAuth 2.0 Web Application credential
5. Add authorized redirect URI: `{YOUR_DOMAIN}/auth/google_calendar-callback`
6. Copy the Client ID to `VITE_GOOGLE_CLIENT_ID`

#### Microsoft (Outlook & Teams)

1. Go to [Azure App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Create a new application
3. Add Platform → Web
4. Redirect URI: `{YOUR_DOMAIN}/auth/outlook_calendar-callback` and `{YOUR_DOMAIN}/auth/teams-callback`
5. Create a client secret
6. Grant permissions:
   - Calendars.ReadWrite (for Outlook)
   - Team.ReadWrite (for Teams)
7. Copy the Client ID to `VITE_MICROSOFT_CLIENT_ID`

#### Slack

1. Go to [Slack API](https://api.slack.com/apps)
2. Create a new app
3. Basic Information → App Credentials → Copy Client ID
4. OAuth & Permissions → Redirect URLs:
   - Add `{YOUR_DOMAIN}/auth/slack-callback`
5. Scopes → Add required scopes (chat:write, users:read, etc.)
6. Copy the Client ID to `VITE_SLACK_CLIENT_ID`

## Backend API Endpoints

The following endpoints must be implemented on your backend to handle OAuth callbacks:

### `/api/integrations/google-calendar/callback`

**POST** — Exchange authorization code for tokens

```json
{
  "code": "authorization_code_from_oauth",
  "userId": "user_id_from_state"
}
```

Response:

```json
{
  "calendars": [
    {
      "id": "calendar@gmail.com",
      "summary": "Primary Calendar",
      "access_token": "...",
      "refresh_token": "..."
    }
  ]
}
```

### `/api/integrations/slack/callback`

**POST** — Exchange authorization code for Slack tokens

```json
{
  "code": "authorization_code_from_oauth",
  "userId": "user_id_from_state"
}
```

Response:

```json
{
  "access_token": "xoxb-...",
  "team_id": "T...",
  "team_name": "My Workspace",
  "user_id": "U..."
}
```

### `/api/integrations/outlook-calendar/callback`

**POST** — Exchange authorization code for Microsoft tokens

Same pattern as Google Calendar.

### `/api/integrations/teams/callback`

**POST** — Exchange authorization code for Teams tokens

Same pattern as Slack.

## API Reference

### Connect a User Integration

```javascript
await connectUserIntegration({
  user_id: 'uuid',
  integration_type: 'google_calendar',
  integration_name: 'calendar@gmail.com',
  oauth_token: 'access_token',
  oauth_refresh_token: 'refresh_token',
  token_expires_at: '2026-01-01T00:00:00Z',
  settings: { calendar_id: '...', calendar_name: '...' }
})
```

### Get User's Integrations

```javascript
const integrations = await getUserIntegrations(userId)
```

### Enable/Disable Sync

```javascript
// Enable two-way sync
await enableIntegrationSync(integrationId, 'both')

// Disable sync
await disableIntegrationSync(integrationId)
```

### View Integration Activity

```javascript
const logs = await getIntegrationActivity(integrationId, limit = 20)
```

### Disconnect Integration

```javascript
await disconnectUserIntegration(integrationId)
```

## Supported Integration Types

| Type | Provider | OAuth | Sync | Notes |
|------|----------|-------|------|-------|
| `google_calendar` | Google | ✓ | ✓ | Full calendar read/write |
| `outlook_calendar` | Microsoft | ✓ | ✓ | Exchange/Outlook |
| `slack` | Slack | ✓ | ✓ | Workspace notifications |
| `teams` | Microsoft | ✓ | ✓ | Teams notifications |
| `email_forward` | Email | ✗ | ✗ | Email forwarding |
| `zapier` | Zapier | ✗ | ✗ | API key based |
| `ifttt` | IFTTT | ✗ | ✗ | API key based |
| `custom` | Custom | ✗ | ✓ | User-defined |

## Security Considerations

1. **Token Storage** — OAuth tokens are stored in the database but should be encrypted at the application layer before sending
2. **RLS Policies** — Database row-level security ensures users can only access their own integrations
3. **Token Expiry** — Refresh tokens are automatically checked and refreshed when they expire
4. **Activity Logging** — All integration events are logged for audit purposes
5. **No Admin Access** — Admins cannot see user personal integration credentials

## Implementing Sync

To implement actual data syncing between integrations and the platform:

1. Create a sync function in `src/lib/user-integrations/sync.js`
2. Call sync functions when `sync_enabled = true`
3. Use `recordIntegrationSync()` to log sync results
4. Handle token refresh during sync with `checkTokenExpiry()` and `refreshUserIntegrationToken()`

Example:

```javascript
export async function syncGoogleCalendar(integration) {
  // Check if token needs refresh
  if (await checkTokenExpiry(integration)) {
    const refreshed = await refreshToken(integration.oauth_refresh_token)
    await refreshUserIntegrationToken(
      integration.id,
      refreshed.access_token,
      refreshed.refresh_token,
      refreshed.expires_at
    )
  }

  // Perform sync
  const result = await performSync(integration)
  
  // Log sync result
  await recordIntegrationSync(integration.id, {
    sync_type: 'calendar_events',
    direction: 'both',
    items_synced: result.count,
    items_failed: result.errors.length,
    error_message: result.errors.length > 0 ? result.errors[0] : null,
  })
}
```

## Pages & Routes

- **Personal Integrations Manager** — `/settings/personal-integrations`
- **OAuth Callbacks** — `/auth/{type}-callback`
- **Workspace Integrations** — `/settings/integrations` (admin only)

## Testing

To test the OAuth flow locally:

1. Set `VITE_FRONTEND_URL=http://localhost:5173` in `.env.local`
2. Configure OAuth provider redirect URIs to use `localhost:5173`
3. Use browser DevTools Network tab to inspect callback requests
4. Check `user_integrations` table to verify integration was created

## Troubleshooting

### OAuth Redirects to Wrong URL

- Check `VITE_FRONTEND_URL` matches your domain
- Verify redirect URIs in OAuth provider match exactly (including trailing slashes)

### Token Refresh Fails

- Ensure refresh token is stored correctly
- Check OAuth provider's token endpoint
- Verify token hasn't been revoked by user

### Sync Not Triggering

- Verify `sync_enabled = true` in database
- Check activity logs for errors
- Implement backend job scheduler to trigger syncs

## Future Enhancements

- [ ] Custom webhook integrations
- [ ] Two-factor authentication for sensitive integrations
- [ ] Granular permission scoping per integration
- [ ] Sync schedule configuration UI
- [ ] Integration marketplace
