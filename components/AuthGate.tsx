'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [authCheckComplete, setAuthCheckComplete] = useState(false)

  // Check if we're in PWA standalone mode
  const isPWA = typeof window !== 'undefined' &&
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    console.log('🔐 AuthGate check:', {
      loading,
      hasUser: !!user,
      userEmail: user?.email,
      currentPath: pathname,
      authCheckComplete,
      isPWA
    })

    // Only redirect if we're not currently on the login page and auth check is complete
    if (!loading && !user && !authCheckComplete) {
      // Give Firebase auth state more time to propagate in PWA mode
      const timeoutDuration = isPWA ? 2000 : 1000 // 2 seconds for PWA, 1 second for web

      const timeoutId = setTimeout(() => {
        console.log(`🚫 AuthGate: No user found after ${timeoutDuration}ms timeout, redirecting to login`)
        router.replace('/login')
        setAuthCheckComplete(true)
      }, timeoutDuration)

      return () => clearTimeout(timeoutId)
    } else if (!loading && user) {
      console.log('✅ AuthGate: User authenticated, allowing access')
      setAuthCheckComplete(true)
    }
  }, [loading, user, router, pathname, authCheckComplete, isPWA])

  // Show loading while auth is being determined
  if (loading || (!authCheckComplete && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    )
  }

  return <>{children}</>
}

