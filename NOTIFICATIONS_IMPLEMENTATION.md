# Multi-Channel Notifications Implementation Guide

## Status: ✅ Phases 1-2 Complete | Phase 3 (Mobile) Ready for Setup

### Overview
Multi-channel notifications are now implemented across Browser Push, Email, and the foundation for Mobile Push notifications.

## Phase 1: Browser Push Notifications ✅ COMPLETE

### What's Implemented
- **Service Worker** (`public/service-worker.js`)
  - Handles incoming push events from the server
  - Manages notification clicks and navigation
  - Supports background sync for offline notifications

- **Service Worker Registration** (`src/App.jsx`)
  - Automatically registers on app startup
  - Fails gracefully if not supported

- **Permission Prompt** (`src/components/notifications/NotificationPermissionPrompt.jsx`)
  - Asks users for browser notification permission on first login
  - Shows one-time prompt with enable/disable options
  - Saves preference to database

- **Display Location**
  - Appears in Shell layout (top of main content area)
  - Only shows when permission is in "default" state

### How to Use Browser Push
```javascript
import { sendBrowserPushNotification } from '../lib/notifications'

// Send a notification
await sendBrowserPushNotification('Task Assigned', {
  body: 'You have been assigned a new task',
  tag: 'task-assigned',
  data: { url: '/my-tasks' }
})
```

### Testing Browser Push
1. Go to Settings → Notifications tab
2. Click "Enable Browser Notifications"
3. Grant permission in browser popup
4. Users will now receive desktop alerts when browser push is triggered

## Phase 2: Email Notifications ✅ COMPLETE

### What's Implemented
- **Enhanced Email Function** (`supabase/functions/send-notification-email/index.ts`)
  - 8+ notification types with rich HTML templates
  - Branded email design with BLW Canada OS header/footer
  - Action buttons that deep-link to relevant pages
  - Responsive design for mobile clients

- **Notification Types Supported**
  - `task_assigned` — When task assigned to user
  - `task_comment` — When comment added to user's task
  - `comment_added` — Legacy alias for task_comment
  - `mention` — When user is @mentioned
  - `sprint_added` — When added to a sprint
  - `invitation_accepted` — When user accepts invitation
  - `event_approval_pending` — When calendar event needs approval
  - `event_approved` — When user's event is approved
  - `meeting_reminder` — 1-hour before meeting

- **Email Settings** (`src/components/settings/NotificationsSection.jsx`)
  - Matrix UI showing notification types × channels
  - Toggle per-type, per-channel preferences
  - In-app (always on), Browser Push, Email, Mobile
  - Shows browser notification status and permissions
  - Privacy notice included

### How to Send Email Notifications
```javascript
// Call the edge function from anywhere
const response = await fetch('/functions/v1/send-notification-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: userId,
    notification_type: 'task_assigned',
    payload: {
      task_title: 'Review Q4 Budget',
      assigner_name: 'Sarah Chen',
      action_url: 'https://app.blwcanada.org/my-tasks'
    }
  })
})
```

### Payload Fields (Optional but Recommended)
```javascript
{
  user_id: 'uuid',
  notification_type: 'task_assigned',
  payload: {
    // Common
    action_url: 'https://...',
    
    // Task-related
    task_title: 'Title',
    task_description: 'Description',
    task_id: 'uuid',
    assigner_name: 'Name',
    
    // Comment-related
    comment_excerpt: 'First 50 chars...',
    author_name: 'Name',
    
    // Mention-related
    actor_name: 'Name',
    
    // Sprint-related
    sprint_name: 'Sprint Name',
    added_by: 'Name',
    
    // Event-related
    event_title: 'Event Title',
    submitter_name: 'Name',
    approver_name: 'Name',
    
    // Meeting-related
    meeting_title: 'Meeting Title',
    meeting_time: '2:00 PM'
  }
}
```

### Testing Email Notifications
1. **Test Function**: Use `/functions/v1/test-push-notification?user_id=YOUR_USER_ID`
2. Check your email inbox for test notification
3. Verify HTML formatting and action link work
4. Test disabling notification type in Settings → Notifications
5. Verify disabled types don't send emails

## Phase 3: Mobile Push Notifications 🔄 READY TO SETUP

### What Needs to Be Done

#### Step 1: Firebase Setup
```bash
# Go to Firebase Console
# https://console.firebase.google.com/

# 1. Create or select a project named "blw-canada-os"
# 2. Enable Cloud Messaging
# 3. Go to Project Settings → Cloud Messaging tab
# 4. Copy Server API Key
# 5. Add to Supabase secrets:
#    - FIREBASE_SERVER_KEY = <Server API Key>
#    - FIREBASE_PROJECT_ID = <Your Project ID>
#    - FIREBASE_SENDER_ID = <Sender ID from settings>
```

#### Step 2: Update Service Worker for FCM
```javascript
// public/service-worker.js needs:
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js')

const messaging = firebase.messaging()
messaging.onBackgroundMessage((payload) => {
  // Handle background notifications
})
```

#### Step 3: Request FCM Token
```javascript
// In NotificationPermissionPrompt or Settings
const messaging = getMessaging(firebaseApp)
const token = await getToken(messaging, {
  vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY
})

// Save to user profile
await supabase
  .from('users')
  .update({ fcm_token: token })
  .eq('id', user.id)
```

#### Step 4: Send via FCM in Email Function
```typescript
// In send-notification-email/index.ts, after checking preferences:
if (user?.fcm_token) {
  const firebaseToken = await getFirebaseServiceAccountToken()
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firebaseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: user.fcm_token,
          notification: {
            title: subject,
            body: preview
          },
          data: { url: actionUrl }
        }
      })
    }
  )
}
```

#### Step 5: Database Updates
```sql
-- Add fcm_token to users table if not exists
ALTER TABLE users ADD COLUMN fcm_token TEXT;
CREATE INDEX idx_users_fcm_token ON users(fcm_token) WHERE fcm_token IS NOT NULL;
```

### Testing Mobile Push
1. Install Firebase Console mobile app
2. Register FCM token on a test device
3. Send test notification from Firebase Console
4. Verify device receives push notification
5. Test with disabled notification type in Settings

## Database Tables & Columns

### Existing Tables (No Changes Needed)
- `notifications` — In-app notifications
  - Columns: id, user_id, type, payload, read, created_at

- `user_notification_prefs` — Preference toggles
  - Columns: user_id, notification_type, in_app, email, [browser, mobile]

### New Columns Needed for Mobile (Optional)
```sql
ALTER TABLE users ADD COLUMN fcm_token TEXT;
ALTER TABLE users ADD COLUMN notification_channels JSONB DEFAULT '{"in_app": true, "email": true, "browser": false, "mobile": false}';
```

## Architecture Diagram

```
User Action (task assigned, comment, mention)
    ↓
Backend Trigger or Job
    ├─→ Create in-app notification (instant)
    │   └─→ Push via Supabase Realtime
    │
    └─→ Call send-notification-email function
        ├─→ Check user preferences (user_notification_prefs)
        │
        ├─→ Send HTML Email (Resend API)
        │   └─→ User gets branded email with action link
        │
        └─→ Send Mobile Push (FCM API) [Phase 3]
            └─→ Mobile app receives push notification
```

## Notification Flow

### Current Flow (Phases 1-2) ✅
```
Event → Database Trigger
    → Create in-app notification
    → Send email (if preference enabled)
    → Send browser push (if permission granted)
```

### Future Flow (Phase 3) 🔄
```
Event → Database Trigger
    → Create in-app notification
    → Call send-notification-email
        → Send email (if enabled)
        → Send mobile push via FCM (if enabled & token exists)
        → Could send browser push (if enabled)
```

## Environment Variables

### Required
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
INVITATION_FROM_EMAIL=notifications@blwcanada.org
FRONTEND_URL=https://blwcanada.org
```

### For Mobile Push (Phase 3)
```env
FIREBASE_SERVER_KEY=<From Firebase Console>
FIREBASE_PROJECT_ID=<From Firebase Console>
FIREBASE_SENDER_ID=<From Firebase Console>
REACT_APP_FIREBASE_VAPID_KEY=<Generated in Firebase Console>
```

## Hooks for Integration

When these events happen in your app, call the notification system:

### Task Assigned
```javascript
await fetch('/functions/v1/send-notification-email', {
  method: 'POST',
  body: JSON.stringify({
    user_id: assigneeId,
    notification_type: 'task_assigned',
    payload: {
      task_title: task.title,
      assigner_name: currentUser.name,
      action_url: `${FRONTEND_URL}/my-tasks?taskId=${task.id}`
    }
  })
})
```

### Comment Added
```javascript
await fetch('/functions/v1/send-notification-email', {
  method: 'POST',
  body: JSON.stringify({
    user_id: task.assigned_to,
    notification_type: 'task_comment',
    payload: {
      task_title: task.title,
      author_name: comment.author.name,
      comment_excerpt: comment.body.substring(0, 50),
      action_url: `${FRONTEND_URL}/my-tasks?taskId=${task.id}#comments`
    }
  })
})
```

### Mention in Comment
```javascript
// Extract @mentions from comment body
const mentions = comment.body.match(/@(\w+)/g) || []
for (const mention of mentions) {
  const username = mention.substring(1)
  const mentionedUser = await getUserByUsername(username)
  
  await fetch('/functions/v1/send-notification-email', {
    method: 'POST',
    body: JSON.stringify({
      user_id: mentionedUser.id,
      notification_type: 'mention',
      payload: {
        actor_name: comment.author.name,
        task_title: task.title,
        action_url: `${FRONTEND_URL}/my-tasks?taskId=${task.id}#comments`
      }
    })
  })
}
```

## Testing Checklist

### Browser Push ✅
- [ ] User sees permission prompt on first login
- [ ] Granting permission works (no console errors)
- [ ] Test notification button in settings works
- [ ] Desktop notification appears
- [ ] Clicking notification navigates to correct URL
- [ ] Disabling type stops browser push

### Email ✅
- [ ] Test email sends successfully
- [ ] HTML formatting looks good
- [ ] Action button links work
- [ ] "Manage preferences" link works
- [ ] Footer displays correctly
- [ ] Disabling type stops email

### Mobile Push (Phase 3)
- [ ] FCM token is generated and stored
- [ ] Firebase console shows successful sends
- [ ] Mobile device receives notification
- [ ] Tapping notification navigates to app
- [ ] Preferences respected on mobile

### Preferences Matrix
- [ ] All notification types are listed
- [ ] All channels appear in grid
- [ ] In-app shows as always enabled
- [ ] Toggling a cell saves to database
- [ ] Disabled notifications don't send
- [ ] Preferences persist after logout/login

## Common Issues & Solutions

### Browser Notifications Not Showing
- Check if permission is "granted" in browser settings
- Verify service worker registered: `navigator.serviceWorker.controller`
- Check browser console for errors

### Emails Not Sending
- Verify RESEND_API_KEY is set in Supabase secrets
- Check user has valid email address in database
- Check user_notification_prefs.email is true
- Look at Resend dashboard for bounce/block reasons

### Mobile Push Not Working
- Verify FCM token is being saved to users.fcm_token
- Check FIREBASE_SERVER_KEY is set correctly
- Verify app permissions on mobile device
- Check Firebase console for delivery status

## Performance Notes

- Service worker is lightweight (~5KB)
- Email function makes 2 DB queries + 1 API call (~200ms)
- Notifications are fire-and-forget (async)
- Preference lookups are cached where possible
- No blocking operations on critical paths

## Security Considerations

1. **Service Worker**: Only registers from same origin, handles navigation safely
2. **Emails**: Never expose user IDs in email content, only names
3. **FCM Tokens**: Store securely, rotate regularly
4. **Preferences**: RLS ensures users can only modify their own
5. **API Calls**: Use service account role with restricted permissions

## Next Steps

1. **Immediate**: Test browser push and email notifications in staging
2. **Week 1**: Deploy to production and monitor delivery rates
3. **Week 2-3**: Implement mobile push (Firebase setup + integration)
4. **Week 4**: Add notification scheduling/batching if needed
5. **Ongoing**: Monitor delivery rates and user engagement

## References

- [Web Push API Docs](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Resend Email API](https://resend.com/docs)
