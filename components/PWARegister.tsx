'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    // next-pwa handles service worker registration automatically
    // This component now only handles update notifications and refresh logic
    
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Listen for service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload when new service worker takes control
        window.location.reload()
      })

      // Check for updates periodically (every 5 minutes)
      const checkForUpdates = async () => {
        try {
          const registration = await navigator.serviceWorker.ready
          await registration.update()
        } catch (error) {
          console.error('Service Worker update check failed:', error)
        }
      }

      // Check for updates every 5 minutes
      const updateInterval = setInterval(checkForUpdates, 5 * 60 * 1000)

      // Initial check after 30 seconds
      setTimeout(checkForUpdates, 30000)

      return () => {
        clearInterval(updateInterval)
      }
    }
  }, [])

  return null
}

