# Quick Start: Multi-Channel Notifications

## What's Ready Now ✅

### 1. Browser Push Notifications
- Service worker auto-registers
- Permission prompt shows on login
- Users can enable/disable in Settings
- **Status**: Ready to use

### 2. Email Notifications
- 8+ notification types with HTML templates
- Respects user preferences
- Action buttons with deep links
- **Status**: Ready to use (edge function deployed separately)

### 3. Settings / Preferences Panel
- Matrix UI (notification types × channels)
- Per-type toggles
- Per-channel status display
- **Status**: Ready to use

## What's Needed for Mobile Push 🔄

1. **Firebase Project Setup**
   - Create Firebase project
   - Get Server Key
   - Add to Supabase secrets

2. **Update Service Worker**
   - Import Firebase messaging
   - Add onBackgroundMessage handler

3. **Store FCM Tokens**
   - Get token from Firebase
   - Save to users.fcm_token

4. **Update Email Function**
   - Add FCM sending logic
   - Check for fcm_token before sending

5. **Test on Mobile**
   - Install on real device
   - Verify notifications work

## Deployment Steps

### To Deploy Browser & Email Notifications:
```bash
# 1. Deploy edge function
supabase functions deploy send-notification-email
supabase functions deploy test-push-notification

# 2. Service worker auto-registers from public/
# No additional deploy needed for static files

# 3. Verify in production
curl https://your-app.com/service-worker.js
```

### Environment Variables Needed:
```env
RESEND_API_KEY=<Your Resend API key>
FRONTEND_URL=https://blwcannexus.org
INVITATION_FROM_EMAIL=notifications@blwcannexus.org
```

## Integration Points

### When a task is assigned:
```javascript
await fetch('/functions/v1/send-notification-email', {
  method: 'POST',
  body: JSON.stringify({
    user_id: assignee.id,
    notification_type: 'task_assigned',
    payload: {
      task_title: 'Review Q4 Budget',
      assigner_name: 'Sarah Chen'
    }
  })
})
```

### When someone comments:
```javascript
await fetch('/functions/v1/send-notification-email', {
  method: 'POST',
  body: JSON.stringify({
    user_id: taskOwner.id,
    notification_type: 'task_comment',
    payload: {
      task_title: task.title,
      author_name: commenter.name
    }
  })
})
```

## Files Overview

```
src/
├── App.jsx                                    ← Service worker registration
├── components/
│   ├── notifications/
│   │   └── NotificationPermissionPrompt.jsx   ← Permission request
│   ├── settings/
│   │   └── NotificationsSection.jsx           ← Preferences matrix
│   └── layout/
│       └── Shell.jsx                          ← Shows prompt & section
├── lib/
│   └── notifications.js                       ← Helper functions
└── pages/
    └── settings/Settings.jsx                  ← Imports NotificationsSection

public/
└── service-worker.js                          ← Handles push events

supabase/
└── functions/
    ├── send-notification-email/               ← Main notification engine
    └── test-push-notification/                ← Test endpoint
```

## Testing

### Quick Test
1. Go to Settings → Notifications
2. Enable browser notifications
3. Click "Test" or use curl:
```bash
curl -X POST https://your-app.com/functions/v1/test-push-notification \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_USER_ID"}'
```

### Expected Results
- ✅ In-app notification appears
- ✅ Email sent to user's inbox
- ✅ Desktop notification shows (if browser push enabled)

## Supported Notification Types

| Type | Email | Browser | Mobile |
|------|-------|---------|--------|
| task_assigned | ✅ | ✅ | 🔄 |
| task_comment | ✅ | ✅ | 🔄 |
| mention | ✅ | ✅ | 🔄 |
| sprint_added | ✅ | ✅ | 🔄 |
| event_approval_pending | ✅ | ✅ | 🔄 |
| event_approved | ✅ | ✅ | 🔄 |
| meeting_reminder | ✅ | ✅ | 🔄 |
| invitation_accepted | ✅ | ✅ | 🔄 |

✅ = Implemented | 🔄 = Ready after Firebase setup

## Known Limitations

1. **Browser Push**: Requires user to grant permission (browser limitation)
2. **Email**: Depends on user's email address in database
3. **Mobile**: Requires Firebase setup (Phase 3)
4. **Preference Storage**: Uses existing `user_notification_prefs` table

## Troubleshooting

### Service Worker not registering?
```javascript
// Check in browser console
navigator.serviceWorker.getRegistrations()
// Should show registered controller
```

### Emails not sending?
1. Check RESEND_API_KEY in Supabase secrets
2. Verify user email is valid
3. Check `user_notification_prefs.email = true`
4. Look at Resend dashboard for bounce reasons

### Settings page not showing preferences?
1. Check browser console for errors
2. Verify `user_notification_prefs` table exists
3. Check that user has at least one preference row

## Support

For issues or questions, see `NOTIFICATIONS_IMPLEMENTATION.md` for detailed docs.
