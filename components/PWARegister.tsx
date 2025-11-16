'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const activateUpdate = (registration: ServiceWorkerRegistration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      }

      const registerSW = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          })
          console.log('Service Worker registered:', registration)

          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60000)

          // If there's already an updated worker waiting, activate it
          if (registration.waiting) {
            activateUpdate(registration)
          }

          // When a new service worker is found, activate it as soon as it's installed
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (!newWorker) return
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                activateUpdate(registration)
              }
            })
          })
        } catch (error) {
          console.error('Service Worker registration failed:', error)
        }
      }

      if (document.readyState === 'complete') {
        registerSW()
      } else {
        window.addEventListener('load', registerSW)
      }

      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })
    }
  }, [])

  return null
}

