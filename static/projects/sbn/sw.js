/**
 * Service Worker for Mostamal Hawa PWA
 * Provides offline support and caching
 */

const CACHE_VERSION = 'sbn-v1';
const CACHE_STATIC = 'sbn-static-v1';
const CACHE_DYNAMIC = 'sbn-dynamic-v1';

// Files to cache on install
const STATIC_CACHE_FILES = [
  '/static/projects/sbn/',
  '/static/projects/sbn/index.html',
  '/static/projects/sbn/app.js',
  '/static/projects/sbn/manifest.json',
  '/static/lib/mishkah.core.js',
  '/static/lib/mishkah.store.js',
  '/static/lib/mishkah.div.js',
  '/static/lib/mishkah-utils.js',
  '/static/lib/mishkah-css.css'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_CACHE_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Error caching static files:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_STATIC && cacheName !== CACHE_DYNAMIC) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests (handle them differently)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if available
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first strategy for static resources
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        console.log('[SW] Fetching from network:', url.pathname);
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response
            const responseClone = response.clone();

            // Cache the response
            caches.open(CACHE_DYNAMIC)
              .then((cache) => {
                cache.put(request, responseClone);
              });

            return response;
          })
          .catch((err) => {
            console.error('[SW] Fetch error:', err);

            // Return offline page if available
            return caches.match('/static/projects/sbn/index.html');
          });
      })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Background sync event (for future use)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Sync data with server
      fetch('/api/sync')
        .then((response) => response.json())
        .then((data) => {
          console.log('[SW] Data synced:', data);
        })
        .catch((err) => {
          console.error('[SW] Sync error:', err);
        })
    );
  }
});

// Push notification event (for future use)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'مستعمل حوا';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: '/static/projects/sbn/icons/icon-192x192.png',
    badge: '/static/projects/sbn/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: data,
    actions: [
      {
        action: 'open',
        title: 'فتح'
      },
      {
        action: 'close',
        title: 'إغلاق'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/static/projects/sbn/')
    );
  }
});
