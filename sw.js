const CACHE_NAME = "Quick Delivery";
const urlsToCache = [
  "/",
  "/index.html",
  "/css",
  "/js",
  "IMG-20250807-WA0001.jpg",
  "IMG-20250807-WA0001.jpg"
];

// Install service worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch files
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});