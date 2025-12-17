'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, ShieldCheck, Mail, Send, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const { user, login, loginWithEmail, loading, redirecting, redirectFailed, clearRedirectFlag } = useAuth()
  const router = useRouter()
  const [signing, setSigning] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('rs-auth-redirect') === '1'
  })
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState(() => {
    // Pre-fill email from localStorage if available
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rs-last-email') || ''
    }
    return ''
  })
  const [emailSent, setEmailSent] = useState(false)
  const [pastedLink, setPastedLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [clipboardChecked, setClipboardChecked] = useState(false)
  const [autoDetected, setAutoDetected] = useState(false)
  const [isPWA, setIsPWA] = useState(false)
  const [clipboardAccessStatus, setClipboardAccessStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [preEmailMagicLink, setPreEmailMagicLink] = useState<string | null>(null)
  const [userGestureTriggered, setUserGestureTriggered] = useState(false)

  // PWA Environment Detection
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkPWA = () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
      const isInStandaloneMode = (window.navigator as any).standalone === true ||
                                window.matchMedia('(display-mode: standalone)').matches
      const currentIsPWA = isInStandaloneMode || window.matchMedia('(display-mode: standalone)').matches

      setIsPWA(currentIsPWA)
      console.log('📱 PWA Status:', { isPWA: currentIsPWA, isIOS, isInStandaloneMode })
    }

    checkPWA()

    // Listen for display mode changes (when PWA is installed/uninstalled)
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleChange = () => checkPWA()
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // PWA Deep Link Detection - Check URL parameters for magic link (works immediately)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlParams = new URLSearchParams(window.location.search)
    const urlFragment = window.location.hash.substring(1)

    // Check for Firebase auth parameters in URL
    const hasAuthParams = urlParams.has('apiKey') || urlParams.has('oobCode') || urlFragment.includes('apiKey=')
    const hasAuthFinish = window.location.pathname.includes('auth/finish') || urlFragment.includes('auth/finish')

    if (hasAuthParams && hasAuthFinish) {
      const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`
      console.log('🔗 PWA Deep Link: Magic link detected in URL parameters')

      // If email hasn't been sent yet, store for later
      if (!emailSent) {
        setPreEmailMagicLink(fullUrl)
        setAutoDetected(true)
        console.log('📋 Pre-email magic link stored for auto-submit when email is sent')
      } else {
        // Email already sent, auto-submit immediately
        setPastedLink(fullUrl)
        setAutoDetected(true)
        setClipboardChecked(true)

        setTimeout(() => {
          console.log('🚀 PWA Deep Link: Auto-submitting magic link')
          window.location.href = fullUrl
        }, 1000)
      }
    }
  }, [emailSent]) // Re-run when emailSent changes
  const [emailMethod, setEmailMethod] = useState<'custom' | 'firebase' | null>(null)

  useEffect(() => {
    if (!loading && user) {
      router.replace('/account')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!redirecting) {
      setPendingRedirect(false)
    }
  }, [redirecting])

  // iOS-Optimized clipboard monitoring with permission requests
  const checkClipboardForMagicLink = async () => {
    if (clipboardChecked) return // Already processed a link

    const isIOS = typeof window !== 'undefined' &&
                  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  !(window as any).MSStream
    const isIOSPWA = isIOS && isPWA

    console.log('🔍 Clipboard check triggered:', { isPWA, isIOS, isIOSPWA, emailSent })

    // Enhanced validation for different PWA environments
    const validateMagicLink = (text: string): boolean => {
      if (!text || text.length < 50) return false

      // Basic Firebase link validation
      const hasAuthFinish = text.includes('auth/finish')
      const hasApiKey = text.includes('apiKey=')
      const hasAuthParams = text.includes('oobCode=') || text.includes('mode=signIn') || text.includes('mode=magic')
      const isValidUrl = text.startsWith('http://') || text.startsWith('https://')

      // For PWAs, also accept shorter custom magic links
      const isCustomMagicLink = text.includes('/auth/finish?email=') && text.includes('&timestamp=') && text.includes('&session=')

      return (hasAuthFinish && hasApiKey && hasAuthParams && isValidUrl) || isCustomMagicLink
    }

    // iOS-specific clipboard permission request and access
    const requestIOSClipboardAccess = async () => {
      if (!isIOS) return null

      try {
        console.log('📱 iOS: Requesting clipboard access...')

        // For iOS, we need to show a permission prompt
        // The first call to readText() will trigger the iOS permission dialog
        const clipboardText = await navigator.clipboard.readText()

        console.log('✅ iOS clipboard access granted')
        setClipboardAccessStatus('granted')
        return clipboardText
      } catch (error: any) {
        console.log('❌ iOS clipboard access denied or failed:', error.message)

        // If it's a permission denied error, update status
        if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
          setClipboardAccessStatus('denied')
        }

        return null
      }
    }

    try {
      let clipboardText: string | null = null

      // Special handling for iOS devices
      if (isIOS) {
        clipboardText = await requestIOSClipboardAccess()
        if (!clipboardText) {
          console.log('📱 iOS: Clipboard access failed, cannot proceed')
          setClipboardAccessStatus('denied')
          setUserGestureTriggered(true)
          return false
        }
      } else {
        // For non-iOS devices, direct clipboard access
        clipboardText = await navigator.clipboard.readText()
        setClipboardAccessStatus('granted')
      }

      setUserGestureTriggered(true)

      if (validateMagicLink(clipboardText)) {
        console.log('🎉 Smart clipboard detection: Valid magic link found!', { isIOS, isPWA, emailSent })

        // Handle pre-email vs post-email detection differently
        if (!emailSent) {
          // Store for later auto-submit when email is sent
          setPreEmailMagicLink(clipboardText)
          setAutoDetected(true)
          console.log('📋 Pre-email magic link detected and stored - will auto-submit when email is sent')
        } else {
          // Email sent, auto-submit immediately
          setPastedLink(clipboardText)
          setAutoDetected(true)
          setClipboardChecked(true)

          // Auto-submit with iOS-optimized timing (fastest for iOS)
          setTimeout(() => {
            try {
              if (isIOSPWA) {
                console.log('📱 iOS PWA: Opening link in same context')
                window.location.href = clipboardText
              } else {
                window.location.href = clipboardText
              }
            } catch (navError) {
              console.error('Navigation failed:', navError)
              setLinkError('Failed to navigate to magic link. Please try manually.')
            }
          }, isIOS ? 500 : isPWA ? 600 : 800)
        }

        return true // Success
      } else {
        console.log('📋 Clipboard checked but no valid magic link found')
        return false // No magic link found
      }

    } catch (clipboardError: any) {
      console.log('📋 Clipboard access failed:', clipboardError.message)

      // Update status based on error type
      if (clipboardError.name === 'NotAllowedError' || clipboardError.message.includes('permission')) {
        setClipboardAccessStatus('denied')
      } else {
        setClipboardAccessStatus('denied')
      }

      setUserGestureTriggered(true)
      return false // Access failed
    }
  }

  // iOS-specific automatic clipboard permission and monitoring
  useEffect(() => {
    if (clipboardChecked || userGestureTriggered) return

    const isIOS = typeof window !== 'undefined' &&
                  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  !(window as any).MSStream

    if (!isIOS) return // Only for iOS devices

    console.log('📱 iOS detected, setting up automatic clipboard monitoring...')

    let permissionInterval: NodeJS.Timeout
    let attempts = 0
    const maxAttempts = 20 // Check for permission multiple times

    const checkIOSClipboardPermission = async () => {
      attempts++
      console.log(`📱 iOS clipboard permission check (attempt ${attempts})`)

      try {
        // Try to read clipboard - this will trigger iOS permission dialog
        const clipboardText = await navigator.clipboard.readText()

        console.log('✅ iOS clipboard permission granted automatically!')
        setClipboardAccessStatus('granted')
        setUserGestureTriggered(true)

        // Now check if there's a magic link
        const validateMagicLink = (text: string): boolean => {
          if (!text || text.length < 50) return false
          const hasAuthFinish = text.includes('auth/finish')
          const hasApiKey = text.includes('apiKey=')
          const hasAuthParams = text.includes('oobCode=') || text.includes('mode=signIn') || text.includes('mode=magic')
          const isValidUrl = text.startsWith('http://') || text.startsWith('https://')
          const isCustomMagicLink = text.includes('/auth/finish?email=') && text.includes('&timestamp=') && text.includes('&session=')
          return (hasAuthFinish && hasApiKey && hasAuthParams && isValidUrl) || isCustomMagicLink
        }

        if (validateMagicLink(clipboardText)) {
          console.log('🎉 iOS automatic clipboard detection: Magic link found!')

          if (!emailSent) {
            setPreEmailMagicLink(clipboardText)
            setAutoDetected(true)
            console.log('📋 iOS: Pre-email magic link auto-detected and stored')
          } else {
            setPastedLink(clipboardText)
            setAutoDetected(true)
            setClipboardChecked(true)

            setTimeout(() => {
              console.log('🚀 iOS: Auto-submitting magic link')
              window.location.href = clipboardText
            }, 500)
          }

          return // Stop checking
        }

      } catch (error: any) {
        // Permission not granted yet, or access failed
        console.log(`📱 iOS clipboard permission not granted (attempt ${attempts})`)

        // Continue checking for a while
        if (attempts < maxAttempts) {
          permissionInterval = setTimeout(checkIOSClipboardPermission, 2000) // Check every 2 seconds
        } else {
          console.log('📱 iOS: Stopped checking for clipboard permission')
          setClipboardAccessStatus('denied')
          setUserGestureTriggered(true) // Mark as triggered so manual checks can work
        }
      }
    }

    // Start checking immediately for iOS
    permissionInterval = setTimeout(checkIOSClipboardPermission, 500)

    return () => {
      if (permissionInterval) clearTimeout(permissionInterval)
    }
  }, [emailSent, clipboardChecked, userGestureTriggered])

  // Auto-check clipboard on user gestures (for PWAs)
  const handleUserGesture = () => {
    if (isPWA && !userGestureTriggered && !clipboardChecked) {
      console.log('👆 User gesture detected, checking clipboard...')
      checkClipboardForMagicLink()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary-50 text-primary-600">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sign in to Royal Suppliers</h1>
            <p className="text-gray-500 text-sm">Access your workspaces securely</p>
          </div>
        </div>

        {/* Email Link Sign-in */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Sign in with Email Link</span>
          </div>

          {!emailSent ? (
            <>
              {/* Pre-email magic link indicator */}
              {preEmailMagicLink && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-600" />
                    <p className="text-sm text-green-800 font-medium">
                      ✨ Magic link detected! Send email to auto-sign in
                    </p>
                  </div>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!email.trim()) {
                    setError('Please enter a valid email address')
                    return
                  }
                  // Trigger the send button click
                  const sendButton = document.querySelector('button[type="submit"]') as HTMLButtonElement
                  if (sendButton) sendButton.click()
                }}
              >
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null) // Clear error when user types
                  }}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={loading || signing || pendingRedirect}
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </form>
                <button
                  onClick={async () => {
                    if (!email.trim()) {
                      setError('Please enter a valid email address')
                      return
                    }

                    setSigning(true)
                    setError(null)
                    try {
                      // Send the email
                      const result = await loginWithEmail(email.trim())
                      setEmailMethod(result.method === 'custom' ? 'custom' : 'firebase')

                      // Remember the email for future use
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('rs-last-email', email.trim())
                      }

                      setEmailSent(true)

                      // Auto-submit pre-detected magic link immediately
                      if (preEmailMagicLink) {
                        console.log('🚀 Auto-submitting pre-detected magic link now that email is sent')
                        setPastedLink(preEmailMagicLink)
                        setClipboardChecked(true)
                        setTimeout(() => {
                          window.location.href = preEmailMagicLink
                        }, 500) // Quick submit for pre-detected links
                      }
                    } catch (err: any) {
                      setError(err?.message || 'Failed to send email link. Please try again.')
                    } finally {
                      setSigning(false)
                    }
                  }}
                disabled={loading || signing || pendingRedirect || !email.trim()}
                className={`w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-white font-semibold shadow-sm hover:opacity-90 transition-colors disabled:opacity-60 ${
                  preEmailMagicLink
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
Get login link
              </button>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-center mb-4">
                <CheckCircle size={24} className="text-green-600 mx-auto mb-2" />
                <p className="text-green-800 font-medium">Email Sent</p>
                <p className="text-sm text-green-700 mt-1">Check your email and paste the magic link below</p>
              </div>

              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-700 mb-3">
                    Sign in with Magic Link
                  </p>
                  <p className="text-sm text-gray-600">
                    Copy the link from your email and paste it below
                  </p>
                </div>

                {/* Auto-submit input */}
                <input
                  type="url"
                  placeholder="Paste your magic link here..."
                  value={pastedLink}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setPastedLink(newValue)
                    setLinkError('')
                    setAutoDetected(false)

                    // Auto-submit immediately when a valid link is pasted
                    const trimmedLink = newValue.trim()
                    if (trimmedLink && trimmedLink.includes('auth/finish') && trimmedLink.startsWith('http')) {
                      console.log('🚀 Auto-submitting pasted link:', trimmedLink)
                      // Immediate redirect without delay
                      window.location.href = trimmedLink
                    }
                  }}
                  onFocus={() => {
                    // Trigger clipboard check when user focuses (for PWAs)
                    if (isPWA && !userGestureTriggered && !clipboardChecked && clipboardAccessStatus !== 'denied') {
                      console.log('🔍 Input focused, checking clipboard...')
                      checkClipboardForMagicLink()
                    }
                  }}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors text-center font-mono"
                  disabled={loading || signing}
                  autoFocus
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                />

                {linkError && (
                  <p className="text-red-600 text-sm text-center font-medium">{linkError}</p>
                )}
              </div>

              <div className="mt-6 text-center border-t border-green-200 pt-4">
                <button
                  onClick={() => {
                    setEmailSent(false)
                    setPastedLink('')
                    setLinkError('')
                    setClipboardChecked(false)
                    setAutoDetected(false)
                    setPreEmailMagicLink(null)
                    setUserGestureTriggered(false)
                    setClipboardAccessStatus('unknown')
                  }}
                  className="px-4 py-2 text-green-600 hover:text-green-800 underline font-medium"
                >
                  Send to different email
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <button
          onClick={async () => {
            setSigning(true)
            setError(null)
            try {
              await login()
              setPendingRedirect(true)
            } catch (err: any) {
              setSigning(false)
              setPendingRedirect(false)
              setError(err?.message || 'Login failed. Please try again.')
              clearRedirectFlag()
            }
          }}
          disabled={loading || redirecting || signing || pendingRedirect}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold shadow-lg shadow-primary-200 hover:bg-primary-700 transition-colors disabled:opacity-60"
        >
          <LogIn size={20} />
          {redirecting || pendingRedirect ? 'Opening Google...' : signing ? 'Signing in...' : 'Login with Google'}
        </button>
        {redirectFailed && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Google sign-in did not return to the app. Please try again; this is most common on iOS home-screen apps when cookies are blocked.
          </div>
        )}
        <div className="text-xs text-gray-500 space-y-2">
          <p>If Google login stalls on iOS, try:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open Google in this app to seed the session.</li>
            <li>Return and tap Login again.</li>
          </ol>
          <button
            type="button"
            onClick={() => {
              clearRedirectFlag()
              setSigning(false)
              setPendingRedirect(false)
              setError(null)
              if (typeof window !== 'undefined') {
                window.location.href = 'https://accounts.google.com/'
              }
            }}
            className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium"
            disabled={loading || redirecting || signing || pendingRedirect}
          >
            Open Google to sign in
          </button>
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

