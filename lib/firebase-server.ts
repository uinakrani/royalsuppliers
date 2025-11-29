/**
 * Firebase server-side initialization for database operations
 * Used when Firebase Admin SDK is not available
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

function getFirebaseConfig() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'production'
  
  if (environment === 'development') {
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_DEV_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_DEV_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }
  } else {
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }
  }
}

let serverApp: FirebaseApp | undefined
let serverDb: Firestore | undefined

export function getServerFirestore(): Firestore {
  if (serverDb) {
    return serverDb
  }

  const config = getFirebaseConfig()
  
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error('Firebase configuration is missing for server-side operations')
  }

  const existingApps = getApps()
  if (existingApps.length > 0) {
    serverApp = existingApps[0]
  } else {
    serverApp = initializeApp(config)
  }

  serverDb = getFirestore(serverApp)
  return serverDb
}

