// Minimal service worker whose only job is to purge old caches and unregister
self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))

      // Unregister so the app falls back to the network on the next navigation
      await self.registration.unregister()

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Refresh any open tabs so they pick up the network version immediately
      for (const client of clients) {
        client.navigate(client.url)
      }
    })(),
  )
})

// Always serve from network; no offline caching
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})

