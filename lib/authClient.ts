'use client'

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth'
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

export async function loginWithGoogle() {
  const auth = getAuthInstance()
  return signInWithPopup(auth, provider)
}

export async function logoutUser() {
  const auth = getAuthInstance()
  return signOut(auth)
}

export { getAuthInstance }

