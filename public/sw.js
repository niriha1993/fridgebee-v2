// FridgeBee Service Worker
// Two jobs:
//   1. PWA installability — every event listener below contributes to Chrome's
//      install criteria.
//   2. Web Push — handles `push` events from VAPID-signed messages so notifs
//      fire even when the FridgeBee tab is closed.

const SW_VERSION = 'fb-sw-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler — required for installability.
self.addEventListener('fetch', () => {});

// Push event — fires whenever the server sends a Web Push to this user.
// Payload shape (from /api/cron/send-nudges):
//   { title: string, body: string, url?: string, tag?: string }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* fallback below */ }

  const title = data.title || 'FridgeBee 🐝';
  const body  = data.body  || 'Check what\'s expiring in your fridge.';
  const url   = data.url   || '/';
  const tag   = data.tag   || `fb-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
    })
  );
});

// Click — focus an existing tab if FridgeBee is open, otherwise open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winList) => {
      for (const w of winList) {
        if (w.url.includes(self.location.origin)) {
          return w.focus().then(() => w.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
