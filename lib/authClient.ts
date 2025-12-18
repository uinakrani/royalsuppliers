'use client'

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence, signInWithRedirect, getRedirectResult, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { getFirebaseApp } from './firebase'

let authInitialized = false
const provider = new GoogleAuthProvider()
provider.setCustomParameters({
  prompt: 'select_account',
})

// Email link configuration
const actionCodeSettings = {
  // URL you want to redirect back to. The domain (www.example.com) for this
  // URL must be in the authorized domains list in the Firebase Console.
  url: typeof window !== 'undefined' ? `${window.location.origin}/auth/finish` : '',
  // This must be true for PWA deep linking
  handleCodeInApp: true
}

export function setLoginHint(email?: string | null) {
  const params: Record<string, string> = { prompt: 'select_account' }
  if (email) {
    params.login_hint = email
  }
  provider.setCustomParameters(params)
}

function getAuthInstance() {
  const app = getFirebaseApp()
  if (!app) {
    throw new Error('Firebase app is not initialized on the client')
  }
  const auth = getAuth(app)

  if (!authInitialized) {
    authInitialized = true
    // Keep users signed in until they explicitly log out.
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Failed to set auth persistence:', err)
    })

    // Additional PWA-specific handling
    if (typeof window !== 'undefined') {
      const isPWA = (window.navigator as any).standalone === true ||
                    window.matchMedia('(display-mode: standalone)').matches

      if (isPWA) {
        console.log('📱 PWA detected, ensuring auth persistence')
        // Force a reload of auth state on PWA startup to ensure consistency
        setTimeout(() => {
          auth.currentUser?.reload().catch(err => {
            console.warn('Failed to reload user in PWA:', err)
          })
        }, 100)
      }
    }
  }

  return auth
}

export async function loginWithGoogleSmart(preferRedirect: boolean, loginHint?: string | null) {
  const auth = getAuthInstance()
  setLoginHint(loginHint)

  // Try the preferred flow first; if popup is blocked/not supported, fall back to redirect.
  if (preferRedirect) {
    // Mark pending so UI can show spinner after reload.
    if (typeof window !== 'undefined') localStorage.setItem('rs-auth-redirect', '1')
    return signInWithRedirect(auth, provider)
  }

  try {
    return await signInWithPopup(auth, provider)
  } catch (err: any) {
    const code = err?.code || ''
    const shouldFallback =
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user'

    if (shouldFallback) {
      if (typeof window !== 'undefined') localStorage.setItem('rs-auth-redirect', '1')
      return signInWithRedirect(auth, provider)
    }
    throw err
  }
}

export async function handleRedirectResult() {
  const auth = getAuthInstance()
  try {
    const res = await getRedirectResult(auth)
    return res
  } catch (err) {
    console.warn('Redirect result handling failed', err)
    return null
  } finally {
    if (typeof window !== 'undefined') localStorage.removeItem('rs-auth-redirect')
  }
}

export async function logoutUser() {
  const auth = getAuthInstance()
  return signOut(auth)
}

// Email Link Authentication Functions
export async function sendEmailLink(email: string) {
  try {
    // Store email in localStorage for later use
    if (typeof window !== 'undefined') {
      localStorage.setItem('emailForSignIn', email)
    }

    // Get domain for magic link generation
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://yoursite.com'

    // Use ONLY custom email service - no Firebase fallback
    try {
      const response = await fetch('/api/send-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Custom magic link email sent successfully via API')
        return { success: true, method: 'custom' }
      } else {
        throw new Error('API call failed')
      }
    } catch (customError) {
      console.error('Custom email service failed:', customError)
      throw customError // Don't fall back to Firebase
    }
  } catch (error) {
    console.error('Error sending email link:', error)
    throw error
  }
}

export async function signInWithEmailLinkFromUrl(url: string) {
  const auth = getAuthInstance()

  try {
    // Confirm the link is a sign-in with email link.
    if (isSignInWithEmailLink(auth, url)) {
      // Get the email from localStorage
      let email = ''
      if (typeof window !== 'undefined') {
        email = localStorage.getItem('emailForSignIn') || ''
      }

      if (!email) {
        throw new Error('Email not found in localStorage. Please try the sign-in process again.')
      }

      // The client SDK will parse the code from the link for you.
      const result = await signInWithEmailLink(auth, email, url)

      // Clear email from storage.
      if (typeof window !== 'undefined') {
        localStorage.removeItem('emailForSignIn')
      }

      return result
    } else {
      throw new Error('Invalid email link')
    }
  } catch (error) {
    console.error('Error signing in with email link:', error)
    throw error
  }
}

export { getAuthInstance }

