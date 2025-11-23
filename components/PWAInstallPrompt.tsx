'use client'

import { useEffect, useState } from 'react'
import { nativePopup } from './NativePopup'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Detect if device is Android
const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

// Detect if browser is Chrome
const isChrome = (): boolean => {
  if (typeof window === 'undefined') return false
  return /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/i.test(navigator.userAgent)
}

// Detect if iOS
const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [hasShownPrompt, setHasShownPrompt] = useState(false)

  useEffect(() => {
    // Only show install prompt for Android Chrome - skip iOS
    if (isIOS()) {
      return
    }

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      // Request fullscreen for Android when in standalone mode
      if (isAndroid()) {
        requestFullscreenForAndroid()
      }
      return
    }

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed === 'true') {
      return
    }

    // Only proceed if Android Chrome
    if (!isAndroid() || !isChrome()) {
      return
    }

    // Listen for beforeinstallprompt event (Android Chrome only)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show install prompt after a short delay (5 seconds) for Android
      setTimeout(() => {
        if (!hasShownPrompt && !isInstalled) {
          setHasShownPrompt(true)
          showInstallPrompt(e as BeforeInstallPromptEvent)
        }
      }, 5000) // Show after 5 seconds for Android
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setHasShownPrompt(false)
      localStorage.setItem('pwa-installed', 'true')
      localStorage.removeItem('pwa-install-dismissed')
      
      // Request fullscreen after installation
      if (isAndroid()) {
        setTimeout(() => {
          requestFullscreenForAndroid()
        }, 1000)
      }
      
      nativePopup.success(
        'App Installed!',
        'Royal Suppliers has been installed successfully. You can now access it from your home screen.'
      )
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [hasShownPrompt, isInstalled])

  const showInstallPrompt = async (promptEvent: BeforeInstallPromptEvent) => {
    if (!promptEvent) return

    try {
      const result = await nativePopup.confirm({
        title: 'Install Royal Suppliers',
        message: 'Install our app for a better experience:\n\n⚡ Faster loading\n📱 Works offline\n🔔 Better performance\n📲 Easy access from home screen\n\nTap "Install" to add to your home screen.',
        confirmText: 'Install',
        cancelText: 'Not Now',
      })

      if (result) {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        
        if (outcome === 'accepted') {
          nativePopup.success(
            'Installing...',
            'Please follow the on-screen instructions to complete installation.'
          )
        } else {
          // User dismissed - remember for this session
          localStorage.setItem('pwa-install-dismissed', 'true')
        }
        
        setDeferredPrompt(null)
        setHasShownPrompt(true)
      } else {
        // User dismissed - remember for this session
        localStorage.setItem('pwa-install-dismissed', 'true')
        setHasShownPrompt(true)
      }
    } catch (error) {
      console.error('Error showing install prompt:', error)
    }
  }

  // Request fullscreen for Android
  const requestFullscreenForAndroid = async () => {
    if (!isAndroid()) return

    try {
      const doc = document.documentElement as any
      
      // Try different fullscreen methods for Android
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
      // This is fine - we'll try again when user interacts
      console.log('Fullscreen request:', error.message || 'Not available')
    }
  }

  // Expose install function for manual trigger
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).triggerPWAInstall = () => {
        if (deferredPrompt) {
          showInstallPrompt(deferredPrompt)
        } else {
          nativePopup.info(
            'Install App',
            'To install the app, use the menu (three dots) in Chrome and select "Add to Home screen" or "Install app".'
          )
        }
      }
    }
  }, [deferredPrompt])

  return null
}

