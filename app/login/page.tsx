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
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [pastedLink, setPastedLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [clipboardChecked, setClipboardChecked] = useState(false)
  const [autoDetected, setAutoDetected] = useState(false)
  const [isPWA, setIsPWA] = useState(false)
  const [clipboardAccessStatus, setClipboardAccessStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [preEmailMagicLink, setPreEmailMagicLink] = useState<string | null>(null)

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

  // PWA-Aware intelligent clipboard monitoring for magic links (starts immediately)
  useEffect(() => {
    if (clipboardChecked) return // Only skip if we've already found and processed a link

    // PWA environment already detected above
    const isIOS = typeof window !== 'undefined' &&
                  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  !(window as any).MSStream
    const isIOSPWA = isIOS && isPWA

    console.log('🔍 Clipboard monitoring started:', { isPWA, isIOSPWA })

    let checkInterval: NodeJS.Timeout
    let attempts = 0
    const maxAttempts = 30 // Check for 30 seconds
    let clipboardAccessGranted = false

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

    const checkClipboard = async () => {
      attempts++

      try {
        // PWA-specific clipboard access (may require user gesture)
        const clipboardText = await navigator.clipboard.readText()
        clipboardAccessGranted = true
        setClipboardAccessStatus('granted')

        if (validateMagicLink(clipboardText)) {
          console.log('🎉 PWA Smart clipboard detection: Valid magic link found!', { isPWA, isIOSPWA, emailSent })

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

            // Auto-submit with PWA-optimized timing
            setTimeout(() => {
              try {
                // For iOS PWAs, ensure we're opening in the same PWA context
                if (isIOSPWA) {
                  console.log('📱 iOS PWA: Opening link in same context')
                  window.location.href = clipboardText
                } else {
                  window.location.href = clipboardText
                }
              } catch (navError) {
                console.error('Navigation failed in PWA:', navError)
                setLinkError('Failed to navigate to magic link. Please try manually.')
              }
            }, isPWA ? 600 : 800) // Faster auto-submit in PWAs
          }

          return // Stop checking
        }

      } catch (clipboardError: any) {
        // PWA clipboard access often requires user gesture
        console.log(`📋 Clipboard access ${clipboardAccessGranted ? 'working' : 'needs permission'} (attempt ${attempts})`)

        // Track clipboard access status for PWA feedback
        if (!clipboardAccessGranted) {
          setClipboardAccessStatus('denied')
        }

        // In PWAs, clipboard access might be denied initially
        if (!clipboardAccessGranted && attempts === 1) {
          console.log('🔄 PWA clipboard access denied - will retry with user gesture fallback')
        }

        // Continue checking for clipboard access
        if (attempts < maxAttempts && !clipboardChecked) {
          const nextDelay = attempts < 3 ? 1000 : attempts < 10 ? 2000 : 3000
          checkInterval = setTimeout(checkClipboard, nextDelay)
          return
        }
      }

      // Continue normal checking if we haven't found a link yet
      if (attempts < maxAttempts && !clipboardChecked) {
        const delay = attempts < 5 ? 500 : attempts < 15 ? 1500 : 2000
        checkInterval = setTimeout(checkClipboard, delay)
      } else {
        setClipboardChecked(true)
        console.log('⏰ PWA clipboard monitoring completed', { attempts, clipboardAccessGranted })
      }
    }

    // PWA-optimized start timing
    const initialDelay = isPWA ? 100 : 200 // Faster start in PWAs
    checkInterval = setTimeout(checkClipboard, initialDelay)

    return () => {
      if (checkInterval) clearTimeout(checkInterval)
    }
  }, [emailSent, clipboardChecked, isPWA])

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

              <input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={loading || signing || pendingRedirect}
              />
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
                className={`w-full inline-flex items-center justify-center gap-3 px-4 py-2 rounded-lg text-white font-semibold shadow-sm hover:opacity-90 transition-colors disabled:opacity-60 ${
                  preEmailMagicLink
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                {preEmailMagicLink ? 'Send Email & Auto Sign In' : 'Send Magic Link'}
              </button>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-center mb-3">
                <CheckCircle size={20} className="text-green-600 mx-auto mb-1" />
                <p className="text-green-800 font-medium text-sm">Email Sent</p>
              </div>

              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-700 mb-2">
                    Copy link from email
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    Open your email and copy the sign-in link
                  </p>
                  {!clipboardChecked && !preEmailMagicLink && (
                    <p className="text-xs text-blue-600 animate-pulse">
                      {clipboardAccessStatus === 'denied' && isPWA
                        ? '📋 PWA: Copy link from email, then tap to paste here'
                        : '🔍 Smart detection active - paste or copy link to auto-fill'
                      }
                    </p>
                  )}
                  {preEmailMagicLink && !emailSent && (
                    <p className="text-xs text-green-600 font-medium">
                      🎉 Magic link ready! Send email to auto-sign in instantly
                    </p>
                  )}
                  {autoDetected && emailSent && (
                    <p className="text-xs text-green-600 font-medium">
                      🎉 Magic link detected and ready to sign in!
                    </p>
                  )}
                  {/* PWA-specific instructions */}
                  {isPWA && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-700 font-medium mb-1">
                        📱 PWA Mode: Copy link from email, then paste below
                      </p>
                      {clipboardAccessStatus === 'denied' && (
                        <button
                          onClick={() => {
                            // Focus the input to trigger paste on mobile
                            const input = document.querySelector('input[type="url"]') as HTMLInputElement
                            if (input) {
                              input.focus()
                              input.click()
                            }
                          }}
                          className="mt-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Tap to Paste
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="url"
                    placeholder={
                      typeof window !== 'undefined' &&
                      (window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone)
                        ? "Long-press copy from email, then paste here..."
                        : "Paste the magic link here..."
                    }
                    value={pastedLink}
                    onChange={(e) => {
                      setPastedLink(e.target.value)
                      setAutoDetected(false) // Reset auto-detection if user manually types
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-mono transition-all duration-300 ${
                      autoDetected
                        ? 'border-green-400 bg-green-50 shadow-md animate-pulse'
                        : 'border-gray-300'
                    }`}
                    disabled={loading || signing}
                    autoFocus
                  />
                  {autoDetected && (
                    <div className="absolute right-3 top-3 text-green-600 text-sm font-semibold animate-bounce">
                      ✨ Auto-filled!
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    const link = pastedLink.trim()
                    if (!link) return
                    if (!link.includes('auth/finish')) {
                      setLinkError('Invalid link')
                      return
                    }
                    window.location.href = link
                  }}
                  disabled={loading || signing || !pastedLink.trim()}
                  className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Sign In
                </button>

                {linkError && (
                  <div className="text-center">
                    <p className="text-red-600 text-sm font-medium">{linkError}</p>
                    {/* PWA-specific error guidance */}
                    {typeof window !== 'undefined' &&
                     (window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone) && (
                      <p className="text-xs text-gray-600 mt-1">
                        📱 In PWA mode: Try copying the link manually from your email app
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <button
                      onClick={() => {
                        setEmailSent(false)
                        setEmail('')
                        setPastedLink('')
                        setLinkError('')
                        setClipboardChecked(false)
                        setAutoDetected(false)
                        setPreEmailMagicLink(null) // Reset pre-detected link
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

