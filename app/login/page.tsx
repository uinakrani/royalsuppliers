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

  // Auto-check clipboard for magic link when email is sent
  useEffect(() => {
    if (emailSent && !clipboardChecked) {
      const checkClipboard = async () => {
        try {
          const clipboardText = await navigator.clipboard.readText()
          if (clipboardText && clipboardText.includes('auth/finish') && clipboardText.includes('apiKey=')) {
            setPastedLink(clipboardText)
            setClipboardChecked(true)
            // Auto-submit after a short delay
            setTimeout(() => {
              if (clipboardText.includes('auth/finish')) {
                window.location.href = clipboardText
              }
            }, 500)
          }
        } catch (err) {
          // Clipboard access might be denied, that's okay
          console.log('Clipboard access not available')
        }
        setClipboardChecked(true)
      }

      // Check clipboard after component mounts
      const timer = setTimeout(checkClipboard, 1000)
      return () => clearTimeout(timer)
    }
  }, [emailSent, clipboardChecked])

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

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
          <div className="font-semibold">What to expect after login</div>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Choose your company workspace</li>
            <li>Stay signed in until you log out</li>
            <li>Manage your profile image and invitations</li>
          </ul>
        </div>

        {/* Email Link Sign-in */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Sign in with Email Link</span>
          </div>

          {!emailSent ? (
            <>
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
                      await loginWithEmail(email.trim())
                      setEmailSent(true)
                    } catch (err: any) {
                      setError(err?.message || 'Failed to send email link. Please try again.')
                    } finally {
                      setSigning(false)
                    }
                  }}
                disabled={loading || signing || pendingRedirect || !email.trim()}
                className="w-full inline-flex items-center justify-center gap-3 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <Send size={18} />
                Send Magic Link
              </button>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-center mb-3">
                <CheckCircle size={20} className="text-green-600 mx-auto mb-1" />
                <p className="text-green-800 font-medium text-sm">Email Sent</p>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-gray-500 text-center">
                  Copy link from email (looks like this):
                  <div className="font-mono text-xs bg-gray-100 p-1 rounded mt-1 break-all">
                    https://yoursite.com/auth/finish?apiKey=...&oobCode=...&mode=signIn
                  </div>
                </div>

                <input
                  type="url"
                  placeholder="Paste link here..."
                  value={pastedLink}
                  onChange={(e) => setPastedLink(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 text-sm"
                  disabled={loading || signing}
                  autoFocus
                />

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
                  className="w-full py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  Sign In
                </button>

                {linkError && <p className="text-red-600 text-xs text-center">{linkError}</p>}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => window.open('mailto:', '_blank')}
                  className="flex-1 py-1 px-3 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                >
                  Open Email
                </button>
                <button
                  onClick={() => {
                    setEmailSent(false)
                    setEmail('')
                    setPastedLink('')
                    setLinkError('')
                    setClipboardChecked(false)
                  }}
                  className="flex-1 py-1 px-3 text-green-600 hover:text-green-800 underline text-xs"
                >
                  Try Again
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

