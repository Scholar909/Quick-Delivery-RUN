const CACHE_NAME = "site-cache-v1";
const OFFLINE_URL = "/offline.html";

// install: cache shell + offline page
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        "/", 
        "/manifest.json",
        OFFLINE_URL
      ]);
    })
  );
  self.skipWaiting();
});

// activate: cleanup old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch: network-first, then cache, then offline fallback
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    // for page navigations
    event.respondWith(
      fetch(event.request)
        .then(response => {
          let clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(resp => resp || caches.match(OFFLINE_URL))
        )
    );
  } else {
    // for assets (CSS, JS, images)
    event.respondWith(
      caches.match(event.request).then(cachedResp => {
        return cachedResp || fetch(event.request).then(networkResp => {
          let clone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResp;
        }).catch(() => cachedResp);
      })
    );
  }
});