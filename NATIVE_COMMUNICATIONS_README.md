# Native In-App Communications System

Complete implementation of in-app notifications + broadcast campaigns for Supabase + React.

## Overview

This system adds:
- **In-app notification inbox** with real-time updates
- **Broadcast campaigns** to send notifications to user segments
- **User notification preferences** (app/email delivery, quiet hours)
- **Unread count tracking** for badge display
- **100% backward compatible** with existing email system

## Architecture

```
┌─────────────────────────────────────────────┐
│ Frontend (React Components + Hook)          │
├─────────────────────────────────────────────┤
│ • NotificationBellWithDrawer (header icon)  │
│ • NotificationCenter (slide-over drawer)    │
│ • BroadcastCampaignEditor (send form)       │
│ • NotificationPreferences (user settings)   │
│ • useNotifications hook (Realtime + polling)│
└────────┬────────────────────────────────────┘
         │ HTTP REST
┌────────▼────────────────────────────────────┐
│ Edge Functions (Deno/TypeScript)            │
├─────────────────────────────────────────────┤
│ • broadcast-campaign (send notifications)   │
│ • mark-notification-read (track reads)      │
└────────┬────────────────────────────────────┘
         │ SQL
┌────────▼────────────────────────────────────┐
│ Supabase Database (PostgreSQL)              │
├─────────────────────────────────────────────┤
│ • app_notifications (inbox)                 │
│ • broadcast_campaigns (campaign metadata)   │
│ • notification_preferences (user settings)  │
│ • notification_read_state (unread count)    │
│ • communication_unsubscribe_tokens (tokens) │
└─────────────────────────────────────────────┘
```

## Files & Structure

### Database
```
supabase/migrations/
  20260901000000_native_communications_system.sql (Phase 1)
```

### Edge Functions
```
supabase/functions/
  broadcast-campaign/index.ts            (Phase 2)
  mark-notification-read/index.ts        (Phase 2)
  _shared/cors.ts                        (Phase 2 helper)
```

### React Components
```
src/features/communications/components/
  NotificationCenter.tsx                 (slide-over drawer)
  NotificationBell.tsx                   (header icon)
  NotificationBellWithDrawer.tsx          (integration wrapper)
  NotificationCard.tsx                   (individual card)
  NotificationPreferences.tsx             (user settings)
  BroadcastCampaignEditor.tsx            (campaign form)
```

### React Hook
```
src/hooks/
  useNotifications.ts                    (Realtime + polling)
```

## Installation & Setup

### 1. Apply Database Migration

```bash
# In Supabase SQL Editor:
# 1. Open SQL Editor
# 2. Create new query
# 3. Paste entire contents of: supabase/migrations/20260901000000_native_communications_system.sql
# 4. Click "Run"
```

### 2. Deploy Edge Functions

```bash
# Deploy all three functions
supabase functions deploy broadcast-campaign
supabase functions deploy mark-notification-read
```

### 3. Enable pg_cron for Auto-Cleanup (Optional)

Notifications auto-delete after 90 days. To enable:

```sql
-- In Supabase SQL Editor:

-- Enable pg_cron extension (if not enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup_old_notifications (daily at 3 AM UTC)
SELECT cron.schedule(
  'cleanup_old_notifications',
  '0 3 * * *',
  'SELECT cleanup_old_notifications()'
);

-- Schedule cleanup_expired_unsubscribe_tokens (daily at 4 AM UTC)
SELECT cron.schedule(
  'cleanup_expired_unsubscribe_tokens',
  '0 4 * * *',
  'SELECT cleanup_expired_unsubscribe_tokens()'
);
```

### 4. Add Components to Your App

#### A. Add NotificationBellWithDrawer to Header

In your main layout/header component:

```tsx
import { NotificationBellWithDrawer } from '@/features/communications/components/NotificationBellWithDrawer'

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="flex justify-between items-center px-6 py-3">
        <h1>My App</h1>
        <NotificationBellWithDrawer />
      </div>
    </header>
  )
}
```

#### B. Add Preferences Link to User Menu

```tsx
import { NotificationPreferences } from '@/features/communications/components/NotificationPreferences'

// In user settings page or modal:
<NotificationPreferences />
```

#### C. Add Broadcast Campaign Editor to Admin Panel

```tsx
import { BroadcastCampaignEditor } from '@/features/communications/components/BroadcastCampaignEditor'

// In admin broadcast section:
<BroadcastCampaignEditor />
```

## Usage Examples

### Send a Broadcast Campaign

```typescript
// Edge function: POST /functions/v1/broadcast-campaign
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broadcast-campaign`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ campaign_id: 'uuid-here' }),
  }
)

const result = await response.json()
// { success: true, in_app_sent: 42, emails_sent: 38, total_recipients: 50 }
```

### Mark Notifications as Read

```typescript
// Edge function: POST /functions/v1/mark-notification-read
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-notification-read`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      notification_ids: ['id1', 'id2', 'id3'],
    }),
  }
)

const result = await response.json()
// { success: true, marked_count: 3, unread_count: 5 }
```

### Use the Hook

```typescript
import { useNotifications } from '@/hooks/useNotifications'

function MyComponent() {
  const {
    notifications,        // Notification[]
    unreadCount,         // number
    loading,             // boolean
    error,               // Error | null
    lastCheckedAt,       // Date | null (for polling fallback)
    isRealtimeConnected, // boolean
    markAsRead,          // (ids: string[]) => Promise<void>
    refetch,             // () => Promise<void>
    loadMore,            // (cursor: string) => Promise<void>
  } = useNotifications()

  return (
    <div>
      <h2>Notifications ({unreadCount})</h2>
      {notifications.map((n) => (
        <div key={n.id}>
          <h3>{n.title}</h3>
          <p>{n.body}</p>
          <button onClick={() => markAsRead([n.id])}>
            Mark as read
          </button>
        </div>
      ))}
    </div>
  )
}
```

## Features

### Real-time Updates
- Supabase Realtime subscribed to `app_notifications` table
- Notifications appear in inbox <2s after creation
- Automatic fallback to polling (30s interval) if Realtime fails
- "Last checked at" timestamp shown in polling mode

### Unread Count
- Denormalized `notification_read_state` table for fast queries
- Trigger functions maintain count on INSERT/UPDATE
- Badge updated in real-time

### Broadcast Recipients
Recipient filters support:
- **Department**: Email all users in a department
- **Role**: Email all users with a specific role (pastor, leader, etc.)
- **Subgroup**: Email all roster members in a subgroup
- **Individual**: Email specific person
- **CSV Import**: Upload email list

### Email Integration
- Optional: Broadcast to in-app AND email simultaneously
- Hardcoded email template (BLW brand colors: purple #4C2A92, gold #E8A020)
- Subject and body configurable per campaign
- Click tracking on email links
- Unsubscribe link included (one-click RFC 8058 compliant)

### Notification Preferences
Users can control:
- **Broadcasts**: Show in app? Send email?
- **System Alerts**: Show in app? Send email?
- **Direct Messages**: Show in app? Send email?
- **Quiet Hours**: Do not disturb 22:00-08:00 (customizable time & timezone)

### Pagination
- Initial load: 50 most recent notifications
- Load More button: fetch next 50 using cursor pagination
- Efficient queries with indexes on `recipient_user_id` and `created_at`

### Auto-Cleanup
- Notifications deleted after 90 days (via `cleanup_old_notifications()`)
- Unsubscribe tokens deleted after 30 days (via `cleanup_expired_unsubscribe_tokens()`)
- Scheduled via pg_cron (daily at 3 AM & 4 AM UTC)

## Authorization & Permissions

### Broadcast Campaigns
| Role | Permission |
|------|-----------|
| super_admin | CREATE, READ, SEND to any department |
| dept_lead | CREATE, READ, SEND only within own department |
| member | READ only |
| anon | No access |

### Notifications (Reading)
| Role | Permission |
|------|-----------|
| authenticated | READ own notifications only (RLS enforced) |

### Preferences
| Role | Permission |
|------|-----------|
| authenticated | READ/UPDATE own preferences only |

## Database Schema Summary

### app_notifications
- `id` (PK), `recipient_user_id` (FK), `type`, `title`, `body`, `body_html`, `icon_url`, `action_url`
- `sent_at`, `read_at`, `dismissed_at`, `expires_at`
- `priority` (low/normal/high/urgent)
- `email_sent` (boolean)
- `related_campaign_id` (FK, nullable)
- `created_by`, `created_at`, `updated_at`
- **Indexes**: recipient_user_id, read_at, created_at DESC, campaign_id, expires_at
- **RLS**: Users see own only

### broadcast_campaigns
- `id` (PK), `name`, `title`, `body`, `body_html`, `icon_url`
- `recipient_filters` (JSONB array of pills)
- `status` (draft/broadcast/failed)
- `broadcast_at`, `include_email`, `email_subject`, `email_template_id`
- `sent_count`, `read_count`, `clicked_count`
- `created_by`, `created_at`, `updated_at`
- **RLS**: Admins can manage

### notification_preferences
- `user_id` (UNIQUE FK)
- `broadcasts_via_app`, `broadcasts_via_email`
- `system_alerts_via_app`, `system_alerts_via_email`
- `direct_messages_via_app`, `direct_messages_via_email`
- `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`, `quiet_hours_tz`
- **RLS**: Users manage own

### notification_read_state
- `user_id` (UNIQUE FK)
- `unread_count` (denormalized, maintained by triggers)
- `last_checked_at`
- **RLS**: Users manage own

## Environment Variables

Required in `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Required in edge function secrets:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOWED_ORIGIN=https://your-app-url.com
FROM_EMAIL=noreply@blwcannexus.ca
FRONTEND_URL=https://your-app-url.com
RESEND_API_KEY=re_xxxxx (if include_email=true)
```

## Testing

### Test Broadcast Campaign

```bash
# Create a campaign in Supabase (status: draft)
INSERT INTO broadcast_campaigns (
  name, title, body, recipient_filters, status, created_by
) VALUES (
  'Test Campaign',
  'Hello World',
  'This is a test notification',
  '[{"type":"department","deptId":"dept-uuid"}]',
  'draft',
  'user-uuid'
);

# Then call edge function
curl -X POST http://localhost:54321/functions/v1/broadcast-campaign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"campaign_id":"campaign-uuid"}'
```

### Test Mark as Read

```bash
curl -X POST http://localhost:54321/functions/v1/mark-notification-read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"notification_ids":["id1","id2"]}'
```

## Security Features

✅ **Row-Level Security (RLS)** on all tables
✅ **Department boundary checks** - dept_lead confined to own dept
✅ **Secure random tokens** for unsubscribe links (not deterministic)
✅ **Campaign status validation** - prevents re-sends
✅ **Email sanitization** - XSS prevention
✅ **Authentication required** - all edge functions validated
✅ **One-time token use** - unsubscribe tokens marked used

## Backward Compatibility

✅ **Email system unchanged** - communication_campaigns, communication_sends unaffected
✅ **Existing workflows continue** - no breaking changes
✅ **Additive only** - new tables don't interfere with old data

## Troubleshooting

### Notifications not appearing

**Check**:
1. Is Realtime enabled? (Supabase Settings > Realtime > app_notifications should be enabled)
2. Is the user authenticated? (RLS policies block unauthenticated access)
3. Check browser console for errors
4. Verify `user.id` matches `recipient_user_id` in DB

### Realtime not working

- Falls back to polling automatically (30s interval)
- Check browser Network tab for `/realtime/` calls
- May be blocked by firewall - polling still works

### Emails not sending

- Check `RESEND_API_KEY` is set in edge function secrets
- Verify `include_email: true` on campaign
- Check Supabase function logs for errors
- Resend API may be rejecting emails - check Resend dashboard

### Tokens not validating

- Old SHA256 tokens will fail (expected after hotfix)
- Generate new token from unsubscribe link in email
- Tokens expire after 30 days

## Performance Notes

- **Pagination**: 50 notifications per load (cursor-based)
- **Unread count**: Denormalized in `notification_read_state` (O(1) queries)
- **Indexes**: Created on recipient_user_id, created_at, expires_at
- **Cleanup**: Daily at 3 AM & 4 AM UTC (off-peak)
- **Realtime**: Fallback to 30s polling if disconnected

## Future Enhancements (Phase 2+)

- [ ] Scheduled broadcasts (scheduled_at column ready)
- [ ] Link click tracking analytics
- [ ] Email open tracking
- [ ] A/B testing for broadcasts
- [ ] Broadcast templates
- [ ] Notification read receipts
- [ ] Notification categories/grouping
- [ ] Push notifications (web/mobile)

## Support

For issues:
1. Check logs in Supabase > Functions
2. Verify RLS policies are enabled
3. Test edge functions with curl (see Testing section)
4. Review security hotfixes guide

