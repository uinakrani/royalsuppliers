'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailLinkFromUrl } from '@/lib/authClient'
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function AuthFinishPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const handleEmailLink = async () => {
      try {
        console.log('🔗 Email link authentication starting...')

        // Get the current URL
        const url = typeof window !== 'undefined' ? window.location.href : ''
        console.log('📱 Current URL:', url)

        if (!url) {
          setStatus('error')
          setError('Unable to get current URL')
          return
        }

        // Check if this is a sign-in with email link
        const auth = await import('@/lib/authClient').then(m => m.getAuthInstance())
        console.log('🔍 Checking if URL is sign-in link...')

        if (!auth) {
          throw new Error('Firebase auth not initialized')
        }

        // Import the function dynamically to avoid circular imports
        const { isSignInWithEmailLink } = await import('firebase/auth')

        if (isSignInWithEmailLink(auth, url)) {
          console.log('✅ Valid email link detected')

          // Get email from localStorage
          const email = typeof window !== 'undefined' ? localStorage.getItem('emailForSignIn') : ''
          console.log('📧 Email from storage:', email)

          if (!email) {
            throw new Error('Email not found in localStorage. Please try the sign-in process again.')
          }

          // Sign in with the email link
          console.log('🚀 Signing in with email link...')
          const { signInWithEmailLink } = await import('firebase/auth')
          const result = await signInWithEmailLink(auth, email, url)
          console.log('✅ Sign in successful:', result.user.email)

          // Clear email from storage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('emailForSignIn')
          }

          setStatus('success')

          // Redirect to the main app after a short delay
          setTimeout(() => {
            console.log('🔄 Redirecting to account page...')
            router.replace('/account')
          }, 2000)

        } else {
          console.log('❌ Not a valid email link')
          throw new Error('Invalid email link')
        }

      } catch (err: any) {
        console.error('❌ Email link authentication failed:', err)
        setStatus('error')
        setError(err?.message || 'Authentication failed. Please try again.')
      }
    }

    handleEmailLink()
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary-50 text-primary-600">
            <Mail size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Email Link Sign-in</h1>
            <p className="text-gray-500 text-sm">Completing your authentication...</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          {status === 'loading' && (
            <>
              <Loader2 size={48} className="text-primary-600 animate-spin" />
              <p className="text-gray-600 text-center">
                Verifying your email link...
              </p>
              <p className="text-gray-500 text-center text-xs mt-2">
                Check browser console (F12) for debug logs
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} className="text-green-600" />
              <p className="text-green-700 text-center font-medium">
                Successfully signed in!
              </p>
              <p className="text-gray-500 text-center text-sm">
                Redirecting you to your account...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={48} className="text-red-600" />
              <p className="text-red-700 text-center font-medium">
                Sign-in failed
              </p>
              <p className="text-gray-600 text-center text-sm">
                {error}
              </p>

              {/* Debug Information */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 max-w-sm">
                <p className="font-medium mb-2">🔍 Debug Info:</p>
                <p>• PWA must be installed for deep linking</p>
                <p>• Link should open PWA automatically</p>
                <p>• Check browser console for detailed logs</p>
                <p>• URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}</p>
              </div>

              <button
                onClick={() => router.push('/login')}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Return to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}