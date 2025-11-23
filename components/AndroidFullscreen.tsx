'use client'

import { useEffect } from 'react'
import { nativePopup } from './NativePopup'

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

    // Only request fullscreen if in standalone mode
    if (!isStandalone()) {
      return
    }

    // Check if user has already dismissed fullscreen request
    const fullscreenDismissed = localStorage.getItem('android-fullscreen-dismissed')
    if (fullscreenDismissed === 'true') {
      return
    }

    // Request fullscreen after user interaction
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
        // Show a prompt to help user enable fullscreen
        if (error.name !== 'NotAllowedError') {
          console.log('Fullscreen request:', error.message || 'Not available')
        }
      }
    }

    // Request fullscreen on first user interaction
    const handleUserInteraction = () => {
      requestFullscreen()
      // Remove listener after first interaction
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
    }

    // Wait a bit before adding listeners to ensure page is loaded
    const timer = setTimeout(() => {
      document.addEventListener('click', handleUserInteraction, { once: true })
      document.addEventListener('touchstart', handleUserInteraction, { once: true })
    }, 1000)

    // Also try to request fullscreen immediately if possible
    setTimeout(() => {
      requestFullscreen()
    }, 500)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
    }
  }, [])

  return null
}

