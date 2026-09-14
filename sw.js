const CACHE_NAME = 'flashcards-cache-v7';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/icon.svg'
];

self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    // claim clients
    await self.clients.claim();
    // remove old caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>{ if(k!==CACHE_NAME) return caches.delete(k); return Promise.resolve(); }));
  })());
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  // network-first for navigation and core JS/HTML so users get latest code
  const url = new URL(req.url);
  if(req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('app.js')){
    e.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req, copy));
        return res;
      }).catch(()=> caches.match(req).then(cached=> cached || caches.match('index.html')))
    );
    return;
  }

  // cache-first for other assets
  e.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{ const r=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,r)); return res; }).catch(()=>{}))
  );
});
