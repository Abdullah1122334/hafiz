// Hafiz service worker: offline app shell + Android share target.
const VERSION = 'hafiz-v1.0.4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './firebase-config.js',
  './vendor/firebase.js',
  './assets/css/app.css',
  './assets/js/main.js',
  './assets/js/i18n.js',
  './assets/js/prefs.js',
  './assets/js/util.js',
  './assets/js/icons.js',
  './assets/js/idb.js',
  './assets/js/crypto.js',
  './assets/js/vault.js',
  './assets/js/smart.js',
  './assets/js/password.js',
  './assets/js/markdown.js',
  './assets/js/importexport.js',
  './assets/js/backends/local.js',
  './assets/js/backends/cloud.js',
  './assets/js/ui/app.js',
  './assets/js/ui/auth.js',
  './assets/js/ui/brand.js',
  './assets/js/ui/editor.js',
  './assets/js/ui/generator.js',
  './assets/js/ui/menu.js',
  './assets/js/ui/security.js',
  './assets/js/ui/settings.js',
  './assets/js/ui/strength.js',
  './assets/js/ui/syncsetup.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  ...['arabic', 'latin'].flatMap((s) => [400, 500, 600, 700].map((w) => `./assets/fonts/ibm-plex-sans-arabic-${s}-${w}-normal.woff2`)),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function saveShare(entry) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('hafiz-inbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('shares', { autoIncrement: true });
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('shares', 'readwrite');
      tx.objectStore('shares').add(entry);
      tx.oncomplete = () => { r.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('images').filter((f) => f && typeof f !== 'string' && f.size);
    await saveShare({
      title: String(form.get('title') || ''),
      text: String(form.get('text') || ''),
      url: String(form.get('url') || ''),
      files,
      at: Date.now(),
    });
  } catch (err) {
    console.error('share failed', err);
  }
  return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
}

// Stale-while-revalidate for the app's own files: instant loads, works offline, and picks up
// changes (e.g. an edited firebase-config.js) on the next launch.
async function fromCache(request, event) {
  const cache = await caches.open(VERSION);
  const isNav = request.mode === 'navigate';
  const cached = await cache.match(isNav ? './index.html' : request, { ignoreSearch: isNav });
  const network = fetch(request).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(isNav ? './index.html' : request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network.catch(() => cache.match('./index.html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  event.respondWith(fromCache(request, event));
});
