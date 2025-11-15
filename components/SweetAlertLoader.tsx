'use client'

import { useEffect } from 'react'

export default function SweetAlertLoader() {
  useEffect(() => {
    // Check if SweetAlert2 is already loaded (from head script)
    const checkLoaded = () => {
      if (typeof window !== 'undefined') {
        // Check various possible ways SweetAlert2 might be exposed
        if (window.Swal) {
          console.log('✅ SweetAlert2 is loaded (window.Swal)')
          return true
        }
        // @ts-ignore
        if (window.Swal2) {
          console.log('✅ SweetAlert2 is loaded (window.Swal2)')
          // @ts-ignore
          window.Swal = window.Swal2
          return true
        }
        // @ts-ignore
        if (window.sweetalert2) {
          console.log('✅ SweetAlert2 is loaded (window.sweetalert2)')
          // @ts-ignore
          window.Swal = window.sweetalert2
          return true
        }
        return false
      }
      return false
    }

    // Check immediately
    if (checkLoaded()) {
      return
    }

    // Wait a bit for head script to load
    const checkInterval = setInterval(() => {
      if (checkLoaded()) {
        clearInterval(checkInterval)
      }
    }, 100)

    // Also try loading via script tag if not loaded after 2 seconds
    const loadTimeout = setTimeout(() => {
      if (!checkLoaded() && typeof window !== 'undefined') {
        console.log('⚠️ SweetAlert2 not found, loading via script tag...')
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'
        script.async = false // Load synchronously to ensure it's ready
        script.onload = () => {
          console.log('✅ SweetAlert2 loaded via script tag')
          if (window.Swal) {
            console.log('✅ window.Swal is available:', typeof window.Swal)
          } else {
            console.error('❌ window.Swal is not available after script load')
            // Check all possible names
            console.log('Available on window:', Object.keys(window).filter(k => k.toLowerCase().includes('swal')))
          }
        }
        script.onerror = (e) => {
          console.error('❌ Failed to load SweetAlert2 script:', e)
        }
        document.head.appendChild(script)
      }
    }, 2000)

    return () => {
      clearInterval(checkInterval)
      clearTimeout(loadTimeout)
    }
  }, [])

  return null
}

