const CACHE_NAME = "site-cache-v2";
const BASE_URL = "./";
const OFFLINE_URL = BASE_URL + "offline.html";

// Install: cache core files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        BASE_URL,
        BASE_URL + "manifest.json",
        OFFLINE_URL
      ]);
    })
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for assets
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(resp => resp || caches.match(OFFLINE_URL)))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cachedResp => {
        return (
          cachedResp ||
          fetch(event.request).then(networkResp => {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return networkResp;
          }).catch(() => cachedResp)
        );
      })
    );
  }
});