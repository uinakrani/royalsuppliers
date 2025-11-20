'use client'

import { useEffect, useState } from 'react'
import { showToast } from './Toast'
import { sweetAlert } from '@/lib/sweetalert'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Check if app was installed before
    const installed = localStorage.getItem('pwa-installed')
    if (installed === 'true') {
      setIsInstalled(true)
      return
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show install prompt after a delay (user has used the app)
      setTimeout(() => {
        setShowPrompt(true)
        showInstallPrompt(e as BeforeInstallPromptEvent)
      }, 30000) // Show after 30 seconds of usage
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setShowPrompt(false)
      localStorage.setItem('pwa-installed', 'true')
      showToast('App installed successfully!', 'success')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const showInstallPrompt = async (promptEvent: BeforeInstallPromptEvent) => {
    if (!promptEvent) return

    try {
      const result = await sweetAlert.fire({
        title: 'Install Royal Suppliers',
        message: 'Install our app for a better experience:\n\n• ⚡ Faster loading\n• 📱 Works offline\n• 🔔 Push notifications\n• 📲 Easy access from home screen',
        icon: 'info',
        showCancelButton: true,
        confirmText: 'Install Now',
        cancelText: 'Maybe Later',
      })

      if (result.isConfirmed) {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        
        if (outcome === 'accepted') {
          showToast('Installing app...', 'info')
        } else {
          showToast('Installation cancelled', 'info')
        }
        
        setDeferredPrompt(null)
        setShowPrompt(false)
      } else {
        // User dismissed, don't show again for this session
        setShowPrompt(false)
      }
    } catch (error) {
      console.error('Error showing install prompt:', error)
    }
  }

  // Expose install function for manual trigger (e.g., from settings)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).triggerPWAInstall = () => {
        if (deferredPrompt) {
          showInstallPrompt(deferredPrompt)
        } else {
          showToast('Install prompt not available. Please use your browser\'s install option.', 'info')
        }
      }
    }
  }, [deferredPrompt])

  return null
}

