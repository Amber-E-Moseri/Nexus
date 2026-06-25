# User-Level Integrations

Personal integrations allow individual users to connect their own accounts and services without requiring admin setup.

---

## **Overview**

Users can now independently connect:
- **📅 Google Calendar** – Personal calendar sync
- **📆 Outlook Calendar** – Outlook calendar integration
- **💬 Slack** – Receive notifications in Slack
- **🤝 Microsoft Teams** – Receive notifications in Teams
- **✉️ Email Forwarding** – Get email notifications
- **⚡ Zapier** – Create personal automations
- **🔗 IFTTT** – Create IFTTT workflows

**Key Features:**
- ✅ User-private (encrypted tokens, secure storage)
- ✅ Self-service setup (no admin approval needed)
- ✅ Activity logging (audit trail of all actions)
- ✅ Sync configuration (pull/push/bidirectional)
- ✅ One-click disconnect

---

## **User Experience**

### **Step 1: Access Personal Integrations**
```
Settings → Integrations → Personal Integrations
```

### **Step 2: Connect an Integration**
```
1. Click "+ Add" on desired integration
2. Follow OAuth flow (e.g., Google login)
3. Grant permissions
4. Integration automatically configured
5. Toggle "Enable Sync" if applicable
```

### **Step 3: Manage Integration**
```
Click ⋮ menu on integration card:
├─ Enable/Disable Sync
├─ View Activity Log
└─ Disconnect
```

### **Step 4: Sync Configuration**
```
Sync Direction Options:
├─ ← Receive (pull from external service)
├─ → Send (push to external service)
└─ ↔️ Both (bidirectional sync)
```

---

## **Database Schema**

### **user_integrations**
```sql
id                   UUID           -- Integration ID
user_id             UUID           -- Owner (RLS protected)
integration_type    TEXT           -- google_calendar, slack, etc.
integration_name    TEXT           -- Unique name per user per type
display_name        TEXT           -- Human-readable name
oauth_token         TEXT           -- Encrypted token (app layer)
oauth_refresh_token TEXT           -- Refresh token (if OAuth2)
token_expires_at    TIMESTAMPTZ    -- Token expiry
settings            JSONB          -- Integration-specific config
is_active          BOOLEAN         -- Connected/disconnected
is_verified        BOOLEAN         -- Email/phone verified
sync_enabled       BOOLEAN         -- Sync active
sync_direction     TEXT            -- to_external|from_external|both
last_sync_at       TIMESTAMPTZ     -- Last successful sync
sync_status        TEXT            -- success|error
connected_at       TIMESTAMPTZ     -- When connected
disconnected_at    TIMESTAMPTZ     -- When disconnected
```

### **user_integration_activity** (Audit Log)
```sql
id               UUID
user_id          UUID
integration_id   UUID
action           TEXT  -- connected, synced, token_refreshed, etc.
status           TEXT  -- success, failed
error_message    TEXT
metadata         JSONB
created_at       TIMESTAMPTZ
```

### **user_integration_logs** (Sync History)
```sql
id               UUID
integration_id   UUID
sync_type        TEXT
direction        TEXT
items_synced     INTEGER
items_failed     INTEGER
started_at       TIMESTAMPTZ
completed_at     TIMESTAMPTZ
duration_seconds INTEGER
status           TEXT  -- pending, in_progress, completed, failed
error_message    TEXT
created_at       TIMESTAMPTZ
```

---

## **Security**

### **Token Storage**
- OAuth tokens stored encrypted in database
- Refresh tokens also encrypted
- Only user accessing their own tokens (RLS enforced)
- Super admins cannot see user tokens

### **Permissions**
```sql
-- User can only see their own integrations
SELECT * FROM user_integrations WHERE user_id = auth.uid()

-- Super admin can audit all integrations (no token access)
SELECT id, user_id, integration_type, is_active, last_sync_at
FROM user_integrations WHERE user_id = admin_user_id
```

### **Best Practices**
- Never log full tokens
- Rotate tokens automatically
- Use secure connection for token exchange
- Implement rate limiting on OAuth flows
- Audit all integration events

---

## **API Reference**

### **Connect Integration**
```javascript
import { setupGoogleCalendarIntegration } from '@/lib/user-integrations/api'

const integration = await setupGoogleCalendarIntegration(userId, {
  calendar_id: 'user@gmail.com',
  access_token: 'ya29...',
  refresh_token: 'refresh_...',
  calendar_name: 'My Calendar',
})
```

### **Get User Integrations**
```javascript
import { getUserIntegrations } from '@/lib/user-integrations/api'

const integrations = await getUserIntegrations(userId)
// Returns all active integrations for user
```

### **Enable Sync**
```javascript
import { enableIntegrationSync } from '@/lib/user-integrations/api'

await enableIntegrationSync(integrationId, 'both')
// 'both' | 'to_external' | 'from_external'
```

### **Log Sync Result**
```javascript
import { recordIntegrationSync } from '@/lib/user-integrations/api'

await recordIntegrationSync(integrationId, {
  sync_type: 'calendar',
  direction: 'from_external',
  items_synced: 24,
  items_failed: 0,
})
```

### **Disconnect**
```javascript
import { disconnectUserIntegration } from '@/lib/user-integrations/api'

await disconnectUserIntegration(integrationId)
// Sets is_active = false, records disconnected_at
```

---

## **Integration Implementations**

### **Google Calendar**

**Setup:**
```javascript
const integration = await setupGoogleCalendarIntegration(userId, {
  calendar_id: 'user@gmail.com',
  access_token: 'token',
  refresh_token: 'refresh_token',
})
```

**Settings:**
```javascript
{
  calendar_id: "user@gmail.com",
  calendar_name: "My Calendar",
  color: "#4C2A92"
}
```

**Sync Flow:**
1. Get events from user's Google Calendar
2. Auto-approve events as org-wide
3. Add to calendar_events table with `user_integration_id`
4. Respect sync_direction setting

### **Slack**

**Setup:**
```javascript
const integration = await setupSlackIntegration(userId, {
  team_id: 'T123...',
  access_token: 'xoxb-...',
  user_id: 'U123...',
  channel_id: 'C123...' // optional
})
```

**Settings:**
```javascript
{
  team_id: "T123",
  team_name: "My Workspace",
  user_id: "U123",
  channel_id: "C123" // DM if null
}
```

**Notification Flow:**
1. When event occurs, check user's Slack integration
2. If enabled, send Slack message
3. Log to user_integration_logs

### **Email Forwarding**

**Setup:**
```javascript
const integration = await setupEmailIntegration(userId, 'user@example.com')
```

**Settings:**
```javascript
{
  email: "user@example.com",
  verified: false  // Must verify via email link
}
```

**Verification:**
1. Send verification email to user
2. User clicks link with token
3. Mark as verified in database
4. Start sending notifications

---

## **Activity Logging**

Every integration action is logged for audit trail:

```javascript
// User connects Google Calendar
→ action: 'connected', status: 'success'

// Sync completes
→ action: 'synced', status: 'success', items_synced: 24

// Token refresh
→ action: 'token_refreshed', status: 'success'

// Sync fails
→ action: 'sync_failed', status: 'failed', error_message: '...'

// Disconnects
→ action: 'disconnected', status: 'success'
```

**Accessing Logs:**
```javascript
import { getIntegrationActivity } from '@/lib/user-integrations/api'

const logs = await getIntegrationActivity(integrationId, limit = 20)
```

---

## **Token Refresh Workflow**

For OAuth2 integrations (Google, Outlook, Slack):

```
Token Expires in 5 minutes?
    ↓
YES → Use refresh_token to get new access_token
    ↓
Update oauth_token and token_expires_at
    ↓
Log 'token_refreshed' action
    ↓
Retry original operation
```

```javascript
import { checkTokenExpiry, refreshUserIntegrationToken } from '@/lib/user-integrations/api'

const integration = await getUserIntegration(integrationId)
if (await checkTokenExpiry(integration)) {
  await refreshUserIntegrationToken(integrationId, newToken, newRefresh, expiresAt)
}
```

---

## **Sync Configuration**

### **Pull (← from_external)**
```
External service → User's account
Example: Google Calendar → Personal calendar inbox
Flow:
1. Fetch events from external service
2. Auto-approve as user's personal events
3. Store with integration_source_id
4. On disconnect: remove synced events
```

### **Push (→ to_external)**
```
User's account → External service
Example: Create task → Add to Slack channel
Flow:
1. When user creates event/task
2. Check if push integration enabled
3. Format for external service
4. Send via API
5. Log result
```

### **Bidirectional (↔ both)**
```
External ←→ User's account (two-way sync)
Example: Google Calendar ↔ Personal calendar
Flow:
1. Fetch from external service
2. Compare with local version
3. Sync changes in both directions
4. Handle conflicts (timestamp-based)
5. Log all synced items
```

---

## **Conflict Resolution**

For bidirectional syncs:

```
User modifies event locally
    ↓
External service also modifies event
    ↓
Next sync detects conflict
    ↓
Use LATEST timestamp as source of truth
    ↓
Update older version
    ↓
Log conflict resolution
```

---

## **UI Component**

```jsx
import UserIntegrationsManager from '@/features/user-integrations/components/UserIntegrationsManager'

<UserIntegrationsManager />
```

Features:
- ✅ List connected integrations
- ✅ Show available integrations to connect
- ✅ Toggle sync on/off
- ✅ View activity log
- ✅ One-click disconnect
- ✅ Status indicators (verified, syncing)
- ✅ Last sync timestamp
- ✅ Sync direction display

---

## **Common Workflows**

### **User Adds Google Calendar**

```
1. Click "Add Google Calendar"
2. Redirected to Google OAuth
3. User grants calendar.read permission
4. OAuth callback with code
5. Exchange code for tokens
6. Store tokens (encrypted)
7. Fetch calendar details
8. Mark as is_verified = true
9. Show "Connected" status
```

### **Enable Calendar Sync**

```
1. Toggle "Enable Sync" on Google Calendar card
2. Ask: Pull/Push/Both?
3. Set sync_enabled = true, sync_direction = 'both'
4. Manually trigger first sync
5. Show sync status and results
```

### **Daily Auto-Sync**

```
// Scheduled job (cron or serverless)
for each user:
  for each integration with sync_enabled = true:
    try:
      await performSync(integration)
    catch (error):
      await recordIntegrationSync(integration.id, { 
        error_message: error.message,
        items_synced: 0,
        items_failed: 0
      })
```

### **User Disconnects**

```
1. Click "Disconnect"
2. Confirm dialog
3. Call disconnectUserIntegration(id)
4. Sets is_active = false, disconnected_at = NOW
5. Remove synced content? (depends on integration)
6. Log 'disconnected' action
7. Show "Available" state again
```

---

## **Future Enhancements**

- [ ] Custom webhook URLs for manual integrations
- [ ] Integration templates (pre-configured settings)
- [ ] Shared integrations (group Google Calendar)
- [ ] Integration health checks and monitoring
- [ ] Automatic token rotation
- [ ] Bulk import from external services
- [ ] Conditional sync rules (filter events by type)
- [ ] Integration permissions (granular scopes)
- [ ] Sync conflict UI (manual resolution)
- [ ] Integration statistics and analytics
