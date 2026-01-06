'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, ShieldCheck, Mail, Send, CheckCircle, Phone, ArrowLeft, Loader2 } from 'lucide-react'
import { ConfirmationResult } from 'firebase/auth'

type LoginView = 'selection' | 'phone' | 'email'

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

export default function LoginPage() {
  const { user, workspaces, login, loginWithEmail, loginWithPhone, setUpRecaptcha, loading, redirecting, redirectFailed, clearRedirectFlag } = useAuth()
  const router = useRouter()
  const [view, setView] = useState<LoginView>('selection')
  const [signing, setSigning] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('rs-auth-redirect') === '1'
  })
  const [error, setError] = useState<string | null>(null)

  // Email State
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rs-last-email') || ''
    }
    return ''
  })
  const [emailSent, setEmailSent] = useState(false)
  const [pastedLink, setPastedLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [clipboardChecked, setClipboardChecked] = useState(false)
  const [preEmailMagicLink, setPreEmailMagicLink] = useState<string | null>(null)

  // Phone State
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [otpSent, setOtpSent] = useState(false)

  // PWA State
  const [isPWA, setIsPWA] = useState(false)

  // Initialize reCAPTCHA
  useEffect(() => {
    if (view === 'phone' && !otpSent) {
      // Small delay to ensure DOM element is present
      const timer = setTimeout(() => {
        try {
          if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = setUpRecaptcha('recaptcha-button')
          }
        } catch (e) {
          console.error("Recaptcha init error", e)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [view, otpSent, setUpRecaptcha])

  // PWA Environment Detection
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkPWA = () => {
      const isInStandaloneMode = (window.navigator as any).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
      const currentIsPWA = isInStandaloneMode || window.matchMedia('(display-mode: standalone)').matches

      setIsPWA(currentIsPWA)
    }

    checkPWA()
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleChange = () => checkPWA()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // PWA Deep Link Detection
  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlParams = new URLSearchParams(window.location.search)
    const urlFragment = window.location.hash.substring(1)

    const hasAuthParams = urlParams.has('apiKey') || urlParams.has('oobCode') || urlFragment.includes('apiKey=')
    const hasAuthFinish = window.location.pathname.includes('auth/finish') || urlFragment.includes('auth/finish')

    if (hasAuthParams && hasAuthFinish) {
      const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`

      // If we are on the selection screen, switch to email view automatically if deep link detected
      if (view === 'selection') {
        setView('email')
      }

      if (!emailSent) {
        setPreEmailMagicLink(fullUrl)
      } else {
        setPastedLink(fullUrl)
        setClipboardChecked(true)
        setTimeout(() => {
          window.location.href = fullUrl
        }, 1000)
      }
    }
  }, [emailSent, view])

  useEffect(() => {
    if (!loading && user && !redirecting) {
      if (workspaces.length === 0) {
        router.replace('/onboarding')
      } else {
        router.replace('/account')
      }
    }
  }, [loading, user, router, redirecting, workspaces])

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber) {
      setError('Please enter a valid phone number')
      return
    }

    // Basic validation for Indian numbers if not starting with +
    // Expecting pure 10 digit number now
    let formattedNumber = phoneNumber.trim()

    // Remove any non-digits just in case
    formattedNumber = formattedNumber.replace(/\D/g, '')

    if (formattedNumber.length !== 10) {
      setError('Please enter a valid 10-digit phone number')
      return
    }

    formattedNumber = '+91' + formattedNumber

    setSigning(true)
    setError(null)

    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = setUpRecaptcha('recaptcha-button')
      }

      const appVerifier = window.recaptchaVerifier
      const result = await loginWithPhone(formattedNumber, appVerifier)
      setConfirmationResult(result)
      setOtpSent(true)
      setSigning(false)
    } catch (err: any) {
      console.error(err)
      setSigning(false)
      const msg = err.message || 'Failed to send OTP'
      if (msg.includes('reCAPTCHA')) {
        setError('Verification failed. Please refresh and try again.')
      } else if (msg.includes('invalid-phone-number')) {
        setError('Invalid phone number format.')
      } else {
        setError(msg)
      }

      // Reset recaptcha on error
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear()
          window.recaptchaVerifier = null
        } catch (e) { }
      }
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp || !confirmationResult) return

    setSigning(true)
    setError(null)

    try {
      await confirmationResult.confirm(otp)
      // Success handled by AuthContext user effect
    } catch (err: any) {
      setSigning(false)
      setError('Invalid OTP. Please try again.')
      console.error(err)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter a valid email address')
      return
    }

    setSigning(true)
    setError(null)
    try {
      await loginWithEmail(email.trim())
      if (typeof window !== 'undefined') {
        localStorage.setItem('rs-last-email', email.trim())
      }
      setEmailSent(true)

      if (preEmailMagicLink) {
        setPastedLink(preEmailMagicLink)
        setTimeout(() => {
          window.location.href = preEmailMagicLink
        }, 500)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send email link.')
    } finally {
      setSigning(false)
    }
  }

  const handleGoogleLogin = async () => {
    setSigning(true)
    setError(null)
    try {
      await login()
      setPendingRedirect(true)
    } catch (err: any) {
      setSigning(false)
      setPendingRedirect(false)
      setError(err?.message || 'Login failed.')
      clearRedirectFlag()
    }
  }

  const resetState = () => {
    setView('selection')
    setError(null)
    setOtpSent(false)
    setOtp('')
    setSigning(false)
    setEmailSent(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary-50 text-primary-600">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {otpSent ? 'Enter Code' : emailSent ? 'Check Email' : 'Sign in'}
            </h1>
            <p className="text-gray-500 text-sm">
              {otpSent ? `Sent to ${phoneNumber}` : emailSent ? `Sent to ${email}` : 'Access your workspaces securely'}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-4 pt-2">

            {/* Phone Option */}
            <button
              onClick={() => setView('phone')}
              className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all group"
            >
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                <Phone size={24} />
              </div>
              <div className="ml-4 text-left">
                <p className="font-semibold text-gray-900">Phone Number</p>
                <p className="text-sm text-gray-500">Sign in with OTP</p>
              </div>
            </button>

            {/* Email Option */}
            <button
              onClick={() => setView('email')}
              className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all group"
            >
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
                <Mail size={24} />
              </div>
              <div className="ml-4 text-left">
                <p className="font-semibold text-gray-900">Magic Link</p>
                <p className="text-sm text-gray-500">Sign in with email link</p>
              </div>
            </button>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or continue with</span>
              </div>
            </div>

            {/* Google Option */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading || redirecting || signing || pendingRedirect}
              className="w-full flex items-center justify-center gap-3 p-4 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700 shadow-sm"
            >
              {loading || redirecting || signing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      className="text-[#4285F4]"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      className="text-[#34A853]"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      className="text-[#FBBC05]"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      className="text-[#EA4335]"
                    />
                  </svg>
                  Login with Google
                </>
              )}
            </button>
          </div>
        )}

        {view === 'phone' && (
          <div>
            {!otpSent ? (
              <form onSubmit={handlePhoneLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-medium">+91</span>
                    </div>
                    <input
                      type="tel"
                      placeholder="98765 43210"
                      value={phoneNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                        setPhoneNumber(val)
                      }}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-wider"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enter your 10-digit mobile number</p>
                </div>

                {/* Changed id to match setupRecaptcha call */}
                <div id="recaptcha-button"></div>

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={signing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {signing ? <Loader2 size={18} className="animate-spin" /> : 'Send Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('selection')}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to options
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enter Verification Code</label>
                  <input
                    type="text"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-xl tracking-widest font-mono"
                    autoFocus
                    maxLength={6}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={signing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {signing ? <Loader2 size={18} className="animate-spin" /> : 'Verify & Login'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false)
                      setConfirmationResult(null)
                      setOtp('')
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Change phone number
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {view === 'email' && (
          <div className="space-y-4">
            {!emailSent ? (
              <>
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

                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError(null)
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={signing || !email.trim()}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-semibold hover:opacity-90 transition-colors disabled:opacity-60 ${preEmailMagicLink ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                      {signing ? <Loader2 size={18} className="animate-spin" /> : 'Send Login Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('selection')}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Back to options
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="text-center mb-6">
                  <CheckCircle size={24} className="text-green-600 mx-auto mb-2" />
                  <p className="text-green-800 font-medium">Email Sent</p>
                  <p className="text-sm text-green-700">Paste your magic link below if it doesn&apos;t open automatically</p>
                </div>

                <input
                  type="url"
                  placeholder="Paste magic link here..."
                  value={pastedLink}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setPastedLink(newValue)
                    setLinkError('')
                    if (newValue.trim().includes('auth/finish')) {
                      window.location.href = newValue.trim()
                    }
                  }}
                  className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center font-mono"
                  autoFocus
                />
                {linkError && (
                  <p className="text-red-600 text-sm text-center font-medium mt-2">{linkError}</p>
                )}

                <div className="text-center mt-4 space-y-2">
                  <button
                    onClick={() => setEmailSent(false)}
                    className="text-green-600 hover:text-green-800 underline font-medium block w-full"
                  >
                    Use different email
                  </button>
                  <button
                    type="button"
                    onClick={() => resetState()}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to options
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
