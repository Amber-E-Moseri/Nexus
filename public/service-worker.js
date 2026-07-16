// Service Worker for PWA: offline support, caching, and push notifications
// Version: 1.0.0 (increment on deploy for cache busting)

const CACHE_VERSION = 'v1.0.5';
const STATIC_CACHE = `nexus-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `nexus-dynamic-${CACHE_VERSION}`;
const API_CACHE = `nexus-api-${CACHE_VERSION}`;

// Static assets that should be cached on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/logo-purple.svg',
  '/logo-purple-192.png',
  '/logo.png',
  '/canada_sr.png',
];

// Cache expiration times (ms)
const CACHE_EXPIRY = {
  API: 5 * 60 * 1000,      // 5 minutes for API responses
  HTML: 60 * 60 * 1000,    // 1 hour for HTML
  ASSET: 7 * 24 * 60 * 1000, // 7 days for assets
};

async function createCacheableResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', Date.now().toString());

  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Install event: cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing v1.0.0');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Service Worker] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.includes(CACHE_VERSION)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Auth and realtime traffic must NEVER be cached (BLW-14): a cached token
  // response would be replayed after expiry and break session refresh.
  if (url.pathname.includes('/auth/v1/') || url.pathname.includes('/realtime/v1/')) {
    return; // let the browser handle it directly
  }

  // API calls: Network-first, fall back to cache
  if (url.pathname.startsWith('/api/') || url.origin.includes('supabase')) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // HTML files: Network-first with cache fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(htmlFirstStrategy(request));
    return;
  }

  // Static assets: Cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/) ||
    url.pathname.includes('/assets/')
  ) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
});

/**
 * Cache-first strategy: use cache, fall back to network
 * Best for: static assets, images, fonts
 */
function cacheFirstStrategy(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) {
      // Check cache metadata for expiration
      const metadata = cached.headers.get('sw-cached-at');
      const isExpired = metadata && Date.now() - parseInt(metadata) > CACHE_EXPIRY.ASSET;
      if (!isExpired) {
        return cached;
      }
    }

    return fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(cacheName).then(async (cache) => {
          const cacheableResponse = await createCacheableResponse(responseToCache);
          cache.put(request, cacheableResponse);
        });

        return response;
      })
      .catch((err) => {
        // Offline with an expired copy: stale beats broken (BLW-14) —
        // Vite assets are content-hashed, so staleness is cosmetic.
        if (cached) {
          return cached;
        }
        throw err;
      });
  });
}

/**
 * Network-first strategy: use network, fall back to cache
 * Best for: API calls, dynamic content
 */
function networkFirstStrategy(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200 || response.type === 'error') {
        return response;
      }

      const responseToCache = response.clone();
      caches.open(cacheName).then(async (cache) => {
        const cacheableResponse = await createCacheableResponse(responseToCache);
        cache.put(request, cacheableResponse);
      });

      return response;
    })
    .catch(() => {
      return caches.match(request).then((response) => {
        // Offline: serve whatever we have, even past the freshness window —
        // the app shows the offline indicator, and stale data beats a 503
        // (BLW-14). With nothing cached, fail gracefully with a 503 the
        // client-side error handling can surface.
        if (response) {
          return response;
        }
        return new Response('Network error and no cache available', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    });
}

/**
 * HTML-first strategy: network with fallback
 * Best for: HTML pages, app shell
 */
function htmlFirstStrategy(request) {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }

      const responseToCache = response.clone();
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        const cacheableResponse = await createCacheableResponse(responseToCache);
        cache.put(request, cacheableResponse);
      });

      return response;
    })
    .catch(() => {
      return caches.match(request).then((response) => {
        if (response) {
          // Use cached HTML but check if still valid
          const metadata = response.headers.get('sw-cached-at');
          const isExpired = metadata && Date.now() - parseInt(metadata) > CACHE_EXPIRY.HTML;
          if (!isExpired) {
            return response;
          }
        }
        return caches.match('/offline.html');
      });
    });
}

// Push notification: handle incoming push events
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'BLW CAN NEXUS',
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || data.message || 'You have a new notification',
    icon: '/logo-purple-192.png',
    badge: '/logo-purple-192.png',
    tag: data.type || 'notification',
    requireInteraction: data.requireInteraction || false,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
      type: data.type,
    },
    actions: [
      {
        action: 'open',
        title: 'Open',
      },
      {
        action: 'close',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BLW CAN NEXUS', options)
  );
});

// Notification click: handle user interaction
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open in a window
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open in new window if not already open
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Notification close: log for analytics
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification dismissed:', event.notification.tag);
});

// Background sync: sync data when connection is restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      fetch('/api/notifications/sync')
        .then(() => console.log('[Service Worker] Notifications synced'))
        .catch((err) => console.error('[Service Worker] Failed to sync notifications:', err))
    );
  }

  if (event.tag === 'sync-tasks') {
    event.waitUntil(
      fetch('/api/tasks/sync')
        .then(() => console.log('[Service Worker] Tasks synced'))
        .catch((err) => console.error('[Service Worker] Failed to sync tasks:', err))
    );
  }
});

// Message handling: allow clients to communicate with service worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(DYNAMIC_CACHE);
    caches.delete(API_CACHE);
    return;
  }
});

console.log('[Service Worker] Loaded successfully');
