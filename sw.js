// Bump CACHE_NAME whenever ASSETS changes (that is what re-runs the install step and
// pre-caches the new list). Individual files never need a version bump: every same-origin
// request goes to the network first, so deploys show up on the next load.
const CACHE_NAME = 'flashcards-cache-v19';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'manifest.json',
  'firebase-init.js',
  'js/app.js',
  'js/backup.js',
  'js/deck-detail.js',
  'js/decks-view.js',
  'js/decks.js',
  'js/dom.js',
  'js/platform.js',
  'js/scheduler.js',
  'js/storage.js',
  'js/study.js',
  'js/sync.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    await self.clients.claim();
    // remove caches left by older versions
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k !== CACHE_NAME).map(k=>caches.delete(k)));
  })());
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  // Never intercept cross-origin requests (Firebase Auth/Firestore, the gstatic
  // SDK, etc.) — caching those would break auth and turn real-time sync into
  // stale reads. Let the browser handle them normally.
  if(new URL(req.url).origin !== self.location.origin) return;

  // Network first, cache as the offline fallback.
  e.respondWith(
    fetch(req).then(res=>{
      if(res.ok){
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c=>c.put(req, copy));
      }
      return res;
    }).catch(async ()=>{
      const cached = await caches.match(req);
      if(cached) return cached;
      if(req.mode === 'navigate') return caches.match('index.html');
      return Response.error();
    })
  );
});
