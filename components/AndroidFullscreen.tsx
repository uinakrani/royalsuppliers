'use client'

import { useEffect } from 'react'

// Detect if device is Android
const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

// Detect if iOS
const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// Check if app is in standalone/fullscreen mode
const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export default function AndroidFullscreen() {
  useEffect(() => {
    // Only handle Android, skip iOS
    if (isIOS() || !isAndroid()) {
      return
    }

    // Add Android class to body for CSS targeting
    document.body.classList.add('android-device')

    // Request fullscreen more aggressively - even if not in standalone mode yet
    const requestFullscreen = async () => {
      try {
        const doc = document.documentElement as any
        
        // Check if already in fullscreen
        const isFullscreen = !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        )

        if (isFullscreen) {
          return
        }

        // Try different fullscreen methods
        if (doc.requestFullscreen) {
          await doc.requestFullscreen()
        } else if (doc.webkitRequestFullscreen) {
          await doc.webkitRequestFullscreen()
        } else if (doc.mozRequestFullScreen) {
          await doc.mozRequestFullScreen()
        } else if (doc.msRequestFullscreen) {
          await doc.msRequestFullscreen()
        }
      } catch (error: any) {
        // Fullscreen might require user gesture or may not be available
        if (error.name !== 'NotAllowedError') {
          console.log('Fullscreen request:', error.message || 'Not available')
        }
      }
    }

    // Request fullscreen on any user interaction
    const handleUserInteraction = () => {
      requestFullscreen()
    }

    // Add multiple event listeners for better coverage
    const events = ['click', 'touchstart', 'touchend', 'mousedown']
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true })
    })

    // Try to request fullscreen immediately (might work if already in standalone)
    if (isStandalone()) {
      setTimeout(() => {
        requestFullscreen()
      }, 100)
    }

    // Also try after a delay
    const timer1 = setTimeout(() => {
      requestFullscreen()
    }, 1000)

    // Try again after longer delay
    const timer2 = setTimeout(() => {
      requestFullscreen()
    }, 3000)

    // Cleanup
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction)
      })
    }
  }, [])

  return null
}

