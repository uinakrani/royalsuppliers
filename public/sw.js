// Service Worker for PWA
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('order-management-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/orders',
        '/manifest.json',
      ])
    })
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request)
    })
  )
})

