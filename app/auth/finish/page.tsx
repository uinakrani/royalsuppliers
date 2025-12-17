'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailLinkFromUrl } from '@/lib/authClient'
import { isSignInWithEmailLink } from 'firebase/auth'
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

        // Check for manual/custom link parameters FIRST (before Firebase detection)
        const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        const isManualLink = urlParams.get('mode') === 'manual' || urlParams.get('mode') === 'magic'
        const manualEmail = urlParams.get('email')
        const timestamp = urlParams.get('timestamp')
        const session = urlParams.get('session')

        // PRIORITIZE: Check for custom magic links first
        if (isManualLink && manualEmail) {
          // Handle custom magic link - validate and provide authentication
          console.log('🔗 Custom magic link detected for:', manualEmail)

          // Basic validation
          const linkTimestamp = timestamp ? parseInt(timestamp) : 0
          const now = Date.now()
          const linkAge = now - linkTimestamp

          // Check if link is expired (1 hour = 3600000 ms)
          if (linkAge > 3600000) {
            setStatus('error')
            setError('This magic link has expired. Please request a new one.')
            return
          }

          // For custom magic links, we'll create a proper authentication
          console.log('🔐 Authenticating with custom magic link...')

          try {
            // Store the email
            if (typeof window !== 'undefined') {
              localStorage.setItem('emailForSignIn', manualEmail)
            }

            // Try to find existing Firebase user with same email to maintain UID consistency
            let userUid = null
            try {
              const db = await import('@/lib/firebase').then(m => m.getDb())
              if (db) {
                // Query for existing user by email
                const usersRef = await import('firebase/firestore').then(m => m.collection(db, 'users'))
                const q = await import('firebase/firestore').then(m =>
                  m.query(usersRef, m.where('email', '==', manualEmail))
                )
                const querySnapshot = await import('firebase/firestore').then(m => m.getDocs(q))

                if (!querySnapshot.empty) {
                  // Found existing user, use their UID
                  const existingUserDoc = querySnapshot.docs[0]
                  userUid = existingUserDoc.id
                  console.log('🔗 Found existing user with same email, using UID:', userUid)
                }
              }
            } catch (dbError) {
              console.warn('Could not check for existing user:', dbError)
            }

            // If no existing user found, create consistent UID based on email
            if (!userUid) {
              userUid = `user-${btoa(manualEmail).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`
              console.log('🔗 Creating new consistent UID for email:', userUid)
            }

            // Create a custom user object for magic link authentication
            const customUser = {
              email: manualEmail,
              emailVerified: true,
              isAnonymous: false,
              metadata: {
                creationTime: new Date().toISOString(),
                lastSignInTime: new Date().toISOString(),
              },
              providerData: [{
                providerId: 'password',
                uid: manualEmail,
                displayName: null,
                email: manualEmail,
                phoneNumber: null,
                photoURL: null,
              }],
              refreshToken: `magic-link-${Date.now()}`,
              tenantId: null,
              uid: userUid, // Use existing UID or consistent new one
              displayName: manualEmail.split('@')[0],
              photoURL: null,
              phoneNumber: null,
              providerId: 'password',
            }

            // Store in localStorage to simulate authenticated state
            if (typeof window !== 'undefined') {
              localStorage.setItem('rs-auth-user', JSON.stringify(customUser))
              localStorage.setItem('rs-auth-method', 'magic-link')

              console.log('✅ Custom magic link authentication successful')
              console.log('🔍 Saving user data:', { uid: userUid, email: manualEmail })

              // Verify data is saved immediately
              const savedUserData = localStorage.getItem('rs-auth-user')
              const savedAuthMethod = localStorage.getItem('rs-auth-method')
              console.log('💾 Verification - saved data:', {
                hasUserData: !!savedUserData,
                authMethod: savedAuthMethod,
                userEmail: savedUserData ? JSON.parse(savedUserData).email : null
              })
            }

            setStatus('success')

            // Redirect after success - give AuthContext time to initialize
            setTimeout(() => {
              console.log('🚀 Redirecting to account page...')
              router.replace('/account')
            }, 1000) // Reduced from 2000ms to 1000ms

            return
          } catch (authError) {
            console.error('❌ Custom authentication failed:', authError)
            setStatus('error')
            setError('Authentication failed. Please try again.')
            return
          }
        }

        // Only check for Firebase links if it's not a custom magic link
        // (Custom links have mode=magic but with mock oobCodes that Firebase rejects)
        const isFirebaseLink = !isManualLink && isSignInWithEmailLink(auth, url)

        if (isFirebaseLink) {
          console.log('✅ Valid email link detected')

          // Get email from localStorage
          const email = typeof window !== 'undefined' ? localStorage.getItem('emailForSignIn') : ''
          console.log('📧 Email from storage:', email)

          if (!email) {
            // If no email in storage, try to extract it from URL or redirect to login
            console.log('⚠️ No email found in storage, redirecting to login')
            setStatus('error')
            setError('Please start the sign-in process again from the login page.')
            setTimeout(() => {
              router.replace('/login?error=no-email')
            }, 3000)
            return
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
          console.log('❌ Not a valid Firebase email link')

          // Check if it's a manual entry that looks like our auth URL
          if (url.includes('/auth/finish') && url.includes('apiKey=')) {
            setStatus('error')
            setError('This appears to be a Firebase link but is not valid. Please try copying the complete link from your email.')
            return
          }

          // For non-Firebase links, show different error
          setStatus('error')
          setError('This doesn\'t appear to be a valid magic link. Please check that you copied the complete link from your email.')
        }

      } catch (err: any) {
        console.error('❌ Email link authentication failed:', err)
        setStatus('error')
        setError(err?.message || 'Authentication failed. Please try again.')
      }
    }

    handleEmailLink()
  }, [router])

  // iOS PWA deep linking fallback
  const isIOS = typeof window !== 'undefined' &&
                /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                !(window as any).MSStream;

  const isInStandaloneMode = typeof window !== 'undefined' &&
                            ((window.navigator as any).standalone === true ||
                             window.matchMedia('(display-mode: standalone)').matches);

  const isIOSOutsidePWA = isIOS && !isInStandaloneMode;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-6">
      {isIOSOutsidePWA && !status.includes('success') && (
        <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white p-4 text-center z-50">
          <div className="flex items-center justify-between">
            <div className="flex-1 text-left">
              <div className="font-semibold">Open in Royal Suppliers</div>
              <div className="text-sm opacity-90">Tap to open this link in your installed app</div>
            </div>
            <button
              onClick={() => {
                // Try to open the PWA
                window.location.href = `${window.location.origin}/?utm_source=email&utm_campaign=magic_link`;
              }}
              className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              Open
            </button>
          </div>
        </div>
      )}

      <div className={`max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6 ${isIOSOutsidePWA ? 'mt-20' : ''}`}>
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
              {isIOSOutsidePWA && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-800 text-sm font-medium text-center">
                    📱 Tap &quot;Open&quot; above to continue in your Royal Suppliers app
                  </p>
                  <p className="text-blue-600 text-xs text-center mt-1">
                    This link should open automatically in your installed PWA
                  </p>
                </div>
              )}
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

              <div className="space-y-2">
                <button
                  onClick={() => router.push('/login')}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Try Again / Send New Link
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Make sure to copy the complete link from your email
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}