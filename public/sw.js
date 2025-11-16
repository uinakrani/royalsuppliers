// Service Worker for PWA
const CACHE_NAME = 'royal-suppliers-v2'
const urlsToCache = [
  '/',
  '/orders',
  '/invoices',
  '/manifest.json',
]

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache')
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })))
      })
      .catch((error) => {
        console.error('Cache install failed:', error)
      })
  )
  // Force the waiting service worker to become the active service worker
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  // Take control of all pages immediately
  return self.clients.claim()
})

// Support manual skip waiting from client
self.addEventListener('message', (event) => {
	try {
		if (event && event.data && event.data.type === 'SKIP_WAITING') {
			self.skipWaiting()
		}
	} catch (e) {}
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return
  }

	// Use network-first for navigations/HTML to get latest UI, cache-first for others
	const isDocumentRequest =
		event.request.mode === 'navigate' ||
		(event.request.destination === 'document') ||
		(event.request.headers.get('accept') || '').includes('text/html')

	if (isDocumentRequest) {
		event.respondWith(
			(async () => {
				try {
					const networkResponse = await fetch(event.request, { cache: 'no-store' })
					const cache = await caches.open(CACHE_NAME)
					cache.put(event.request, networkResponse.clone())
					return networkResponse
				} catch (e) {
					const cached = await caches.match(event.request)
					return cached || caches.match('/')
				}
			})()
		)
		return
	}

	// Assets: cache-first
	event.respondWith(
		(async () => {
			const cached = await caches.match(event.request)
			if (cached) return cached
			try {
				const networkResponse = await fetch(event.request)
				const cache = await caches.open(CACHE_NAME)
				cache.put(event.request, networkResponse.clone())
				return networkResponse
			} catch (e) {
				return cached
			}
		})()
	)
})

