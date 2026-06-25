# PWA Implementation Guide — BLW Canada Nexus

This document covers the Progressive Web App (PWA) implementation for BLW Canada Nexus, enabling offline support, app installation, and push notifications.

## What is a PWA?

A Progressive Web App is a web application that uses modern web technologies to deliver an app-like experience:
- **Installable** on mobile home screens and desktop
- **Works offline** with cached content
- **Fast** with intelligent caching strategies
- **Secure** served over HTTPS
- **Engaging** with push notifications

## Files Added

### 1. `public/manifest.json`
Web App Manifest that tells browsers how to display the app when installed.

**Key fields:**
- `name`: Full app name (browser install prompt)
- `short_name`: Short name for home screen (12 chars max)
- `start_url`: Page to load when app opens
- `display`: `standalone` (hides browser UI)
- `icons`: App icons at different sizes
- `theme_color`: Toolbar/address bar color
- `screenshots`: App previews in install prompt
- `shortcuts`: Quick actions from home screen

### 2. `public/service-worker.js` (Enhanced)
Service Worker handles offline support, caching, and push notifications.

**Caching Strategies:**
- **Cache-first**: Static assets (JS, CSS, images) - use cache if available, fetch if not
- **Network-first**: API calls - try network first, fall back to cache
- **HTML-first**: Pages - try network, fall back to cache, show offline.html if needed

**Features:**
- Automatic cache versioning (increment `CACHE_VERSION` on deploy)
- Clean up old caches on service worker activation
- Push notification handling
- Background sync for offline actions
- Message handling for client communication

### 3. `public/offline.html`
Fallback page shown when user is offline and content isn't cached.

**Features:**
- Helpful offline message
- Auto-retry every 5 seconds
- Retry button for manual attempts
- Tips for using offline features
- Automatically redirects when connection restored

### 4. `index.html` (Updated)
Added PWA meta tags for browsers and iOS.

**Meta tags:**
- `theme-color`: Browser toolbar color
- `mobile-web-app-capable`: Enable fullscreen on Android
- `apple-mobile-web-app-capable`: Enable fullscreen on iOS
- `apple-mobile-web-app-status-bar-style`: iOS status bar style
- `apple-mobile-web-app-title`: iOS home screen label
- `apple-touch-icon`: iOS home screen icon
- `manifest`: Link to manifest.json

### 5. `src/hooks/usePWA.js`
Custom React hook for PWA state and functions.

**Properties:**
```javascript
const {
  isInstallable,           // Boolean: show install button?
  isInstalled,             // Boolean: app already installed?
  isOnline,                // Boolean: network connected?
  serviceWorkerReady,      // Boolean: service worker active?
  notificationPermission,  // 'granted' | 'denied' | 'default'
} = usePWA()
```

**Methods:**
```javascript
const { install } = usePWA()
await install() // Trigger browser install prompt

const { subscribeToPush } = usePWA()
await subscribeToPush() // Subscribe to push notifications

const { requestNotificationPermission } = usePWA()
const permission = await requestNotificationPermission() // Ask user for permission
```

### 6. `src/components/PWAInstallPrompt.jsx`
Install button component. Shows when app is installable, hides after install/dismiss.

**Usage:**
```javascript
import { PWAInstallPrompt } from './components/PWAInstallPrompt'

export default function App() {
  return (
    <>
      <PWAInstallPrompt />
      {/* rest of app */}
    </>
  )
}
```

**Features:**
- Only shows when app is installable
- Smooth animations
- "Install" and "Not Now" buttons
- Disables after successful install

### 7. `src/components/OfflineIndicator.jsx`
Shows a banner when user loses internet connection.

**Usage:**
```javascript
import { OfflineIndicator } from './components/OfflineIndicator'

export default function App() {
  return (
    <>
      <OfflineIndicator />
      {/* rest of app */}
    </>
  )
}
```

## How Installation Works

### Desktop (Chrome, Edge, Brave)
1. Browser detects manifest.json and service worker
2. "Install" button appears in address bar
3. User clicks → browser shows install dialog
4. App appears in applications/start menu
5. Opens in window without address bar

### Mobile Android (Chrome, Samsung)
1. Browser detects installable PWA
2. "Install app" option appears in 3-dot menu
3. User taps → app added to home screen
4. Opens fullscreen without browser chrome

### Mobile iOS (Safari)
1. Limitations: No `beforeinstallprompt` event
2. User taps Share → "Add to Home Screen"
3. Opens fullscreen (but limited offline support)
4. No push notifications (App Store only)

## Offline Functionality

### What Works Offline
- **Cached pages** load from service worker cache
- **Previously viewed routes** are available
- **Cached assets** (images, CSS, JS) load instantly
- **Local state** persists in IndexedDB
- **Timer/counter features** work locally

### What Requires Network
- **API calls** fail gracefully (show cached data or error)
- **Real-time sync** pauses until connection restores
- **Push notifications** require connection to receive

### Service Worker Cache Strategy

```javascript
// Static assets (cache-first, 30 day TTL)
/assets/* → Check cache first, fetch if missing

// API calls (network-first, 5 sec timeout)
/api/* → Try network, fall back to cache after 5s

// HTML pages (network-first with cache fallback)
/ → Try network, fall back to cache, show offline.html if both fail
```

## Push Notifications

### Setup (Backend Required)

1. **Generate VAPID Keys** (one-time):
```bash
npm install web-push -g
web-push generate-vapid-keys
```

2. **Save in `.env`:**
```
REACT_APP_VAPID_PUBLIC_KEY=your-public-key-here
VITE_VAPID_PUBLIC_KEY=your-public-key-here (for Vite)
```

3. **Create Supabase table** to store subscriptions:
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
```

4. **Save subscription on user action:**
```javascript
import { usePWA } from './hooks/usePWA'

function NotificationSettings() {
  const { requestNotificationPermission, subscribeToPush } = usePWA()

  async function handleEnable() {
    const permission = await requestNotificationPermission()
    if (permission === 'granted') {
      await subscribeToPush()
      // Subscription saved to backend
    }
  }

  return <button onClick={handleEnable}>Enable Notifications</button>
}
```

5. **Send notifications** from backend:
```javascript
const webpush = require('web-push')

webpush.setVapidDetails(
  'mailto:admin@blwcan.org',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const subscription = {
  endpoint: 'https://...',
  keys: { auth: '...', p256dh: '...' }
}

await webpush.sendNotification(subscription, JSON.stringify({
  title: 'Prayer Reminder',
  body: 'Time for evening prayers',
  icon: '/logo.png',
  url: '/prayers'
}))
```

### Notification Permission States

```javascript
const { notificationPermission } = usePWA()

// 'granted' → user allowed notifications
// 'denied' → user blocked notifications (need to go to settings)
// 'default' → user hasn't been asked yet
```

## Caching & Updates

### Cache Versioning

Update when you deploy:

**In `service-worker.js`:**
```javascript
const CACHE_VERSION = 'v1.0.1' // Increment this
const STATIC_CACHE = `nexus-static-${CACHE_VERSION}`
```

Service worker automatically:
- Caches new assets with new version
- Deletes old versioned caches on activation
- Users get fresh assets on next load

### Clearing Cache (Debugging)

In any component:
```javascript
// Clear dynamic and API caches
navigator.serviceWorker.controller?.postMessage({
  type: 'CLEAR_CACHE'
})
```

## Testing PWA

### Desktop Chrome
1. Open DevTools (F12)
2. Go to **Application** tab
3. Check **Manifest** section (should show manifest.json)
4. Check **Service Workers** (should say "active and running")
5. Look for install button in address bar (may not show in localhost)
6. Test offline: DevTools → Network → "Offline" checkbox

### Mobile Chrome
1. Open app in Chrome
2. Tap 3-dot menu → "Install app"
3. Tap "Install"
4. App appears on home screen
5. Open app (should say "BLW Nexus" in title)
6. Turn on Airplane mode
7. Previously visited pages should load

### iOS Safari
1. Open in Safari
2. Tap Share button
3. Scroll and tap "Add to Home Screen"
4. App appears on home screen
5. Limitations: no push notifications, offline support is minimal

### Lighthouse Audit
1. DevTools → Lighthouse
2. Select "Mobile" device
3. Check "PWA" checkbox
4. Generate report
5. Target score: **90+**

## Performance

After PWA implementation, target metrics:

| Metric | Target | Why |
|--------|--------|-----|
| First Load | < 2s | Fast first visit |
| Cached Load | < 500ms | Near-instant when cached |
| Offline | 100% | Works completely offline |
| Install Size | < 5MB | Reasonable download |
| Lighthouse PWA | 90+ | Meets PWA standards |

## Deployment Checklist

- [ ] Manifest loads at `/manifest.json`
- [ ] Service Worker registered and active
- [ ] Icons found in DevTools
- [ ] Install prompt shows on desktop/mobile
- [ ] Offline page loads when disconnected
- [ ] Static assets cache properly
- [ ] API calls fall back to cache
- [ ] Push notification subscription works
- [ ] Lighthouse PWA audit: 90+
- [ ] Can install on home screen
- [ ] App runs fullscreen without address bar
- [ ] Tested on real device (Android/iOS)

## Optional Enhancements

### Background Sync
Sync data in background when user goes online:
```javascript
// In app
navigator.serviceWorker.ready.then(reg => {
  reg.sync.register('sync-tasks')
})

// In service worker
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks())
  }
})
```

### File Handling
Open specific files in Nexus (e.g., PDFs):
```json
// In manifest.json
"file_handlers": [
  {
    "action": "/files",
    "accept": { "application/pdf": [".pdf"] }
  }
]
```

### Share Target
Send content to Nexus from other apps:
```json
// In manifest.json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "application/x-www-form-urlencoded",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

### Splash Screens
Custom images shown while app loads:
```json
// In manifest.json
"splash_screens": [
  {
    "src": "/splash-512x512.png",
    "sizes": "512x512",
    "form_factor": "narrow"
  }
]
```

## Troubleshooting

### App not installable?
- Check service worker is registered (DevTools → Application)
- Ensure manifest.json is valid (no syntax errors)
- Must be served over HTTPS (localhost is ok for testing)
- Icons must exist and be accessible

### Cache not updating?
- Check `CACHE_VERSION` in service-worker.js
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Clear cache in DevTools → Application → Clear storage
- Service worker might be cached by browser

### Offline page doesn't show?
- Check service worker is installed
- Try going fully offline (Airplane mode)
- Check network tab shows offline.html is being served
- Some APIs might not fail gracefully

### Push notifications not working?
- Check notification permission in browser settings
- Ensure VAPID keys are correct
- Service worker must be active
- iOS only supports through App Store apps

## Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev: PWA Checklist](https://web.dev/pwa-checklist/)
- [Manifest.json Reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/draft-thomson-webpush-protocol)

## Support

For issues or questions:
1. Check DevTools → Application tab
2. View service worker console logs
3. Check network requests (online vs offline)
4. Verify manifest.json in browser
5. Test on real device to confirm behavior
