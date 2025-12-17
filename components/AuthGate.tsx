'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    console.log('🔐 AuthGate check:', {
      loading,
      hasUser: !!user,
      userEmail: user?.email,
      currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    })

    if (!loading && !user) {
      console.log('🚫 AuthGate: No user found, redirecting to login')
      router.replace('/login')
    } else if (!loading && user) {
      console.log('✅ AuthGate: User authenticated, allowing access')
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    )
  }

  return <>{children}</>
}

