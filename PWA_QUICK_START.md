# PWA Quick Start — BLW Nexus

Your app is now a Progressive Web App! Here's how to use it.

## 🚀 Deploy & Test

```bash
# Build for production
npm run build

# Test locally (production build)
npm run preview

# Open in browser (usually http://localhost:4173)
```

## 🧪 Quick Tests (2 minutes)

### Desktop Installation
1. Open http://localhost:4173 in Chrome
2. Look for install icon in address bar (or 3-dot menu → "Install app")
3. Click install → confirm dialog
4. App opens in standalone window
5. ✅ Success: No browser address bar visible

### Offline Mode
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox
4. Refresh page → ✅ Loads from cache
5. Try to make API call → ✅ Falls back to cached data
6. Uncheck "Offline" → works normally again

### Check Service Worker
1. DevTools → Application → Service Workers
2. Should say "active and running"
3. Click "unregister" to clear (for testing)

## 📱 Mobile Install

### Android Chrome
1. Tap 3-dot menu
2. Tap "Install app"
3. Confirm dialog
4. App on home screen ✅

### iPhone Safari
1. Tap Share button
2. Scroll → "Add to Home Screen"
3. Confirm
4. App on home screen ✅

## 🔍 What Changed

### New Files
```
public/
├── manifest.json          (app metadata, icons, shortcuts)
├── offline.html           (offline fallback page)
└── service-worker.js      (UPDATED - offline, caching, push)

src/
├── hooks/usePWA.js        (PWA state & functions)
├── components/
│   ├── PWAInstallPrompt.jsx    (install button)
│   └── OfflineIndicator.jsx    (offline banner)
└── App.jsx                (UPDATED - added PWA components)

docs/
└── PWA_IMPLEMENTATION.md  (complete guide)
```

### What Works Offline
- ✅ Previously visited pages load from cache
- ✅ Images, CSS, JavaScript cached
- ✅ App stays responsive
- ✅ Automatic online/offline detection
- ❌ New API calls fail gracefully (cached data shown if available)

## 🛠 Using PWA in Your Code

### Check Online Status
```javascript
import { usePWA } from './hooks/usePWA'

export function MyComponent() {
  const { isOnline } = usePWA()
  
  return (
    <div>
      Status: {isOnline ? '🟢 Online' : '🔴 Offline'}
    </div>
  )
}
```

### Show Install Prompt
```javascript
import { usePWA } from './hooks/usePWA'

export function InstallButton() {
  const { install, isInstallable } = usePWA()
  
  if (!isInstallable) return null
  
  return (
    <button onClick={install}>
      Install App
    </button>
  )
}
```

### Subscribe to Notifications
```javascript
import { usePWA } from './hooks/usePWA'

export function NotificationSettings() {
  const { requestNotificationPermission } = usePWA()
  
  async function enable() {
    const permission = await requestNotificationPermission()
    console.log(permission) // 'granted', 'denied', or 'default'
  }
  
  return <button onClick={enable}>Enable Notifications</button>
}
```

## 🔄 Update Cycle

When you deploy with changes:

1. **Update `CACHE_VERSION`** in `public/service-worker.js`:
   ```javascript
   const CACHE_VERSION = 'v1.0.1' // Increment this
   ```

2. **Deploy** (push to production)

3. **Users get updates** automatically:
   - Service worker detects new version
   - Old caches deleted on activation
   - New assets cached on next visit
   - Page soft-refreshes to load new content

## 📊 Lighthouse Score

Run Lighthouse audit to verify PWA score:

1. DevTools → Lighthouse
2. Select "Mobile"
3. Check "PWA" checkbox
4. Run audit
5. **Target: 90+ score**

## 🐛 Common Issues

### Install button not showing?
- Must be on desktop Chrome/Edge/Brave
- Service Worker must be active (check DevTools)
- Check browser console for errors
- Localhost works, but HTTPS required for production

### Still seeing cached version after update?
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear cache: DevTools → Application → Clear storage
- Make sure you incremented `CACHE_VERSION`

### Offline page shows instead of cached page?
- Page hasn't been visited before (not in cache)
- Check DevTools → Cache Storage → Static cache
- First visit requires network

### Push notifications not working?
- **iOS:** Not supported (App Store only)
- **Android:** Check notification permission in Settings
- **All:** Service Worker must be active

## ✅ You're Ready!

Your app is now a full PWA:
- ✅ Installable on home screens
- ✅ Works offline with cached content
- ✅ Fast with intelligent caching
- ✅ Ready for push notifications

## 📚 Full Documentation

See `docs/PWA_IMPLEMENTATION.md` for:
- Detailed feature explanations
- Push notification setup
- Troubleshooting guide
- Performance metrics
- Background sync
- File handling
- And more...

## 🎯 Next Steps

1. **Deploy to production**
   ```bash
   git add .
   git commit -m "feat: add PWA capabilities"
   git push
   ```

2. **Test on real devices** (not just localhost)
   - iOS device with Safari
   - Android device with Chrome
   - Desktop with Chrome/Edge/Safari

3. **Monitor**: Track PWA installs and offline usage

4. **Push Notifications** (optional):
   - Generate VAPID keys: `web-push generate-vapid-keys`
   - Save to environment variables
   - Create backend API to send notifications
   - See `PWA_IMPLEMENTATION.md` for details

## 💡 Tips

- Users can uninstall like any app
- Cache clears when app is uninstalled
- Can be installed on multiple devices
- Works with or without internet
- Faster than web, lighter than native

## 🆘 Need Help?

1. Check `docs/PWA_IMPLEMENTATION.md`
2. See `PWA_VERIFICATION.md` for testing checklist
3. Check browser DevTools → Application tab
4. Review service worker logs in console
5. Test on real device (not just localhost)

---

**BLW Nexus is now a Progressive Web App!** 🎉
