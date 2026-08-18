const CACHE_NAME = 'bookshelf-v4';
const ASSETS = [
  '/bookshelf/',
  '/bookshelf/index.html',
  '/bookshelf/style.css',
  '/bookshelf/app.js',
  '/bookshelf/db.js',
  '/bookshelf/sync.js',
  '/bookshelf/firebase-sync.js',
  '/bookshelf/bulk-import.js',
  '/bookshelf/manifest.json'
];

// Install — cache all assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (e) => {
  // Skip non-GET requests
  if (e.request.method !== 'GET') return;
  
  // Skip external URLs (CDN, APIs)
  if (!e.request.url.startsWith(self.location.origin)) return;
  
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Update cache with fresh version
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(e.request);
      })
  );
});
