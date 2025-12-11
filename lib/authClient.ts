'use client'

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { getFirebaseApp } from './firebase'

let authInitialized = false
const provider = new GoogleAuthProvider()
provider.setCustomParameters({
  prompt: 'select_account',
})

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
  }

  return auth
}

export async function loginWithGoogleSmart(preferRedirect: boolean) {
  const auth = getAuthInstance()

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

export { getAuthInstance }

