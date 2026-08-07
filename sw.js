/*
 * Service worker for the TARSONS PRODUCTS LIMITED — HSE Portal.
 *
 * Strategy:
 *  - Precache the full app shell (index.html, every css/js module, manifest,
 *    favicon) on install so the portal can open offline.
 *  - Same-origin navigation requests (loading index.html): network-first,
 *    falling back to the cached copy when offline.
 *  - Same-origin static assets (css/js/images): cache-first, falling back to
 *    the network and topping up the cache with whatever comes back.
 *  - Everything else — CDN scripts (Chart.js, XLSX, jsPDF), Firebase,
 *    Supabase (including its realtime websocket), EmailJS, Google Fonts —
 *    is left completely untouched. The service worker never intercepts
 *    cross-origin or non-GET requests, so auth, live sync, and realtime
 *    subscriptions keep working exactly as if there were no service worker.
 *
 * Bump CACHE_VERSION whenever the app shell's file list changes (e.g. a new
 * css/js file is added or removed) so returning visitors pick up the change.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `hse-portal-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './css/admin-dashboard.css',
  './css/assembly-point.css',
  './css/audits-inspections.css',
  './css/base-tokens.css',
  './css/blog.css',
  './css/buttons.css',
  './css/capa.css',
  './css/cards-dashboard.css',
  './css/complaints.css',
  './css/contacts.css',
  './css/ehs-forms.css',
  './css/forms.css',
  './css/gallery.css',
  './css/header-nav.css',
  './css/hira.css',
  './css/location-filter.css',
  './css/misc-polish.css',
  './css/modals.css',
  './css/my-account.css',
  './css/permissions.css',
  './css/policies.css',
  './css/qr-hub.css',
  './css/responsive.css',
  './css/safety-audit.css',
  './css/tables.css',
  './css/theme-dark.css',
  './css/toast.css',
  './css/training-eval.css',
  './css/training-modules.css',
  './js/admin-dashboard.js',
  './js/app-init.js',
  './js/assembly-point.js',
  './js/auth.js',
  './js/blog.js',
  './js/capa.js',
  './js/complaints.js',
  './js/contacts.js',
  './js/core-cloud.js',
  './js/ehs-forms.js',
  './js/extinguishers.js',
  './js/gallery.js',
  './js/hira.js',
  './js/incidents.js',
  './js/inspections.js',
  './js/legal-register.js',
  './js/misc-init.js',
  './js/nav.js',
  './js/notifications.js',
  './js/pdf-export.js',
  './js/policies.js',
  './js/ppe.js',
  './js/profile-avatar.js',
  './js/ptw.js',
  './js/qr-hub.js',
  './js/roles.js',
  './js/storage-utils.js',
  './js/toast.js',
  './js/training.js',
  './js/utils.js',
  './js/visitors-checkin.js',
  './js/visitors.js',
  './js/waste.js',
];

// ---------- install: precache the app shell ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] precache failed:', err))
  );
});

// ---------- activate: drop old caches ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('hse-portal-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- fetch: same-origin only, everything else passes through ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle GET requests.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests. Firebase, Supabase (incl. its realtime
  // websocket), EmailJS, Google Fonts, and the jsdelivr/unpkg CDN scripts
  // must reach the network directly and are never intercepted here.
  if (url.origin !== self.location.origin) return;

  // Navigations (loading the app itself): network-first so users always get
  // the latest deployed version when online, with an offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static app-shell assets (css/js/images): cache-first, refresh in the
  // background from the network.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
