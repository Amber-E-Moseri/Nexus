# PWA Verification Checklist

Complete this checklist after deploying PWA changes to ensure everything works.

## ✅ Files Created/Updated

- [x] `public/manifest.json` — Web app manifest
- [x] `public/service-worker.js` — Enhanced with caching strategies
- [x] `public/offline.html` — Offline fallback page
- [x] `index.html` — PWA meta tags added
- [x] `src/hooks/usePWA.js` — PWA state hook
- [x] `src/components/PWAInstallPrompt.jsx` — Install button
- [x] `src/components/OfflineIndicator.jsx` — Offline indicator
- [x] `src/App.jsx` — PWA components integrated
- [x] `docs/PWA_IMPLEMENTATION.md` — Complete guide

## 🧪 Browser DevTools Checks

### Manifest
- [ ] Open DevTools → Application → Manifest
- [ ] Verify all fields load correctly
- [ ] Check icon URLs are accessible
- [ ] Confirm start_url is `/`
- [ ] Verify display mode is `standalone`

### Service Worker
- [ ] Open DevTools → Application → Service Workers
- [ ] Confirm status says "active and running"
- [ ] Check registration URL is `/service-worker.js`
- [ ] See console logs: `[Service Worker] Loaded successfully`
- [ ] Verify scope is `/`

### Cache Storage
- [ ] Open DevTools → Application → Cache Storage
- [ ] Expand to see `nexus-static-v1.0.0`, `nexus-dynamic-v1.0.0`, `nexus-api-v1.0.0`
- [ ] Verify static assets are cached (JS, CSS, images)
- [ ] Check dynamic cache has pages visited
- [ ] Confirm API cache exists (may be empty if no API calls)

### Storage
- [ ] Check Local Storage, Session Storage, IndexedDB
- [ ] Verify offline state can persist

## 📱 Installation Tests

### Desktop (Chrome/Edge/Brave)
- [ ] Open app in Chrome
- [ ] Look for install icon in address bar (or 3-dot menu)
- [ ] Click install
- [ ] Confirm install dialog appears with:
  - [ ] App name "BLW Nexus"
  - [ ] Logo image
  - [ ] Install and Cancel buttons
- [ ] Confirm app installs to desktop or Start menu
- [ ] Double-click/click to open
- [ ] Verify runs fullscreen (no address bar)
- [ ] Verify title is "BLW Nexus"

### Mobile Android (Chrome)
- [ ] Open on Android phone
- [ ] Tap 3-dot menu → "Install app"
- [ ] Confirm install dialog
- [ ] Tap Install
- [ ] Check home screen for new icon
- [ ] Launch app
- [ ] Verify fullscreen without browser UI
- [ ] Check back button works properly

### Mobile iOS (Safari)
- [ ] Open on iPhone Safari
- [ ] Tap Share button
- [ ] Scroll to "Add to Home Screen"
- [ ] Tap and confirm
- [ ] Check home screen for icon
- [ ] Tap to launch
- [ ] Verify displays fullscreen
- [ ] Note: Push notifications won't work

## 🌐 Online/Offline Tests

### Connected (Normal Operation)
- [ ] No offline indicator visible ✅
- [ ] All pages load quickly
- [ ] API calls succeed
- [ ] Real-time updates work
- [ ] Data syncs properly

### Offline (Airplane Mode)
- [ ] Yellow offline banner appears at top
- [ ] Previously visited pages load from cache
- [ ] API calls show cached data
- [ ] Offline page shows for uncached routes
- [ ] Offline indicator correctly shows connection status
- [ ] Auto-retry works (every 5 seconds)
- [ ] Manual retry button works

### Network Throttling (DevTools → Network → Slow 3G)
- [ ] Pages still load (may take longer)
- [ ] Service worker serves from cache
- [ ] API calls time out after 5 seconds, show cached data
- [ ] No infinite loading states

### Connection Restored
- [ ] Offline banner disappears automatically
- [ ] App resumes normal operation
- [ ] Background sync triggers (if implemented)
- [ ] Data re-syncs with server

## 🔍 Performance Tests

### Lighthouse Audit
1. Open DevTools → Lighthouse
2. Select Mobile device
3. Check "PWA" checkbox
4. Generate report

Expected scores:
- [ ] Performance: 80+
- [ ] Accessibility: 90+
- [ ] Best Practices: 90+
- [ ] SEO: 100
- [ ] PWA: 90+

Check audit results:
- [ ] Installable criteria met
- [ ] Has service worker
- [ ] Has manifest with icons
- [ ] Uses HTTPS
- [ ] Responsive design

### Load Time Tests
- [ ] First visit: < 2 seconds
- [ ] Cached visit (offline): < 500ms
- [ ] Assets load from cache when offline
- [ ] No 404 errors in DevTools

## 🔔 Push Notifications (If Enabled)

### Request Permission Flow
- [ ] User sees notification permission prompt
- [ ] Notification permission saves in browser
- [ ] `usePWA().notificationPermission` returns `'granted'`

### Send Test Notification
- [ ] Send notification from backend
- [ ] Notification appears on screen
- [ ] Notification shows correct title/body
- [ ] Clicking notification opens URL
- [ ] Close action dismisses notification

### Subscription
- [ ] Subscription saved to database
- [ ] Subscription endpoint stored securely
- [ ] Can retrieve and resend to subscriptions

## 🐛 Edge Cases

### Multiple Tabs
- [ ] Open app in two tabs
- [ ] Offline in one tab → both show offline
- [ ] One tab goes online → both update
- [ ] Data syncs across tabs

### Service Worker Updates
- [ ] Deploy new version
- [ ] Increment `CACHE_VERSION` in service-worker.js
- [ ] Old caches automatically deleted on next visit
- [ ] New assets fetched and cached

### Long Offline Period
- [ ] App remains usable offline indefinitely
- [ ] Cache doesn't corrupt
- [ ] Local changes don't conflict when syncing
- [ ] Reconnection re-syncs cleanly

### Uninstall
- [ ] Uninstall from home screen or settings
- [ ] App icon removed
- [ ] Cache is cleared
- [ ] Can reinstall fresh

## 📋 App Features Work Offline

### Works Offline (Cached)
- [ ] Dashboard page loads
- [ ] My Tasks page shows cached tasks
- [ ] Calendar displays previous events
- [ ] Any previously-visited page loads

### Graceful Degradation (Online Required)
- [ ] Creating new task shows "offline" error
- [ ] Editing task shows "offline" error
- [ ] Syncing shows cached version with "pending" indicator
- [ ] Clear retry button appears

## 🚀 Pre-Production Deployment

- [ ] All files committed to git
- [ ] No TypeScript/build errors: `npm run build`
- [ ] Production build works locally: `npm run preview`
- [ ] Service worker loads from production domain
- [ ] Manifest validates (check web.dev/pwa)
- [ ] HTTPS enabled on production
- [ ] Cloudflare/CDN caching configured appropriately

## 📊 Analytics (Optional)

- [ ] Track PWA installation events
- [ ] Monitor offline usage
- [ ] Track push notification engagement
- [ ] Monitor service worker errors

## 🎯 Final Sign-Off

- [ ] All checks above passed
- [ ] No console errors in DevTools
- [ ] No 404s for assets
- [ ] Works on real devices (iOS, Android)
- [ ] Lighthouse PWA score: 90+
- [ ] Performance metrics meet targets
- [ ] Ready to promote to production

## 📞 Issues Found

Document any issues found during testing:

### Issue 1
- **Description:**
- **Steps to reproduce:**
- **Expected behavior:**
- **Actual behavior:**
- **Solution:**

### Issue 2
- **Description:**
- **Steps to reproduce:**
- **Expected behavior:**
- **Actual behavior:**
- **Solution:**

---

**Date Verified:** _______________
**Verified By:** _______________
**Status:** ☐ Passed ☐ Failed (describe issues above)
