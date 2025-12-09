'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    // next-pwa handles service worker registration automatically
    // This component now only handles update notifications and refresh logic
    
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // If an older service worker is still around, unregister it and wipe caches so new deploys are seen immediately
      const forceCleanServiceWorkers = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          const hadRegistrations = registrations.length > 0

          await Promise.all(registrations.map(reg => reg.unregister()))

          if (typeof caches !== 'undefined') {
            const keys = await caches.keys()
            await Promise.all(keys.map(key => caches.delete(key)))
          }

          // Reload once after cleanup so the page is controlled by the network
          if (hadRegistrations) {
            window.location.reload()
          }
        } catch (error) {
          console.error('Service Worker cleanup failed:', error)
        }
      }

      forceCleanServiceWorkers()

      // Listen for service worker updates
      const onControllerChange = () => {
        // Reload when new service worker takes control
        window.location.reload()
      }

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

      let updateInterval: NodeJS.Timeout | undefined

      const initUpdateFlow = async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration()
          if (!registration) {
            return
          }

          const activateWaiting = () => {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' })
            }
          }

          // Try to activate any waiting worker immediately
          activateWaiting()

          // When a new SW is found, push it to activate as soon as it's installed
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (!newWorker) return

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                activateWaiting()
              }
            })
          })

          // Check for updates periodically (every 5 minutes)
          const checkForUpdates = async () => {
            try {
              await registration.update()
              activateWaiting()
            } catch (error) {
              console.error('Service Worker update check failed:', error)
            }
          }

          updateInterval = setInterval(checkForUpdates, 5 * 60 * 1000)

          // Initial check after 30 seconds
          setTimeout(checkForUpdates, 30000)
        } catch (error) {
          console.error('Service Worker setup failed:', error)
        }
      }

      initUpdateFlow()

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
        if (updateInterval) {
          clearInterval(updateInterval)
        }
      }
    }
  }, [])

  return null
}

