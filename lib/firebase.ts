import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let app: FirebaseApp | undefined
let db: Firestore | undefined
let initializationAttempted = false

function initializeFirebase(): Firestore | undefined {
  // Only initialize on client side
  if (typeof window === 'undefined') {
    console.warn('Firebase initialization attempted on server side')
    return undefined
  }

  // If already initialized, return existing db
  if (db) {
    return db
  }

  // Check if Firebase is configured
  const isConfigured = firebaseConfig.apiKey && 
                       firebaseConfig.projectId && 
                       firebaseConfig.appId

  if (!isConfigured) {
    console.error('Firebase is not configured. Please create a .env.local file with your Firebase credentials.')
    console.error('Missing configuration:', {
      apiKey: !firebaseConfig.apiKey,
      projectId: !firebaseConfig.projectId,
      appId: !firebaseConfig.appId,
      allConfig: {
        hasApiKey: !!firebaseConfig.apiKey,
        hasProjectId: !!firebaseConfig.projectId,
        hasAppId: !!firebaseConfig.appId,
      }
    })
    return undefined
  }

  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig)
      console.log('Firebase initialized successfully', {
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey?.substring(0, 10) + '...'
      })
    } else {
      app = getApps()[0]
      console.log('Using existing Firebase app')
    }
    db = getFirestore(app)
    console.log('Firestore database initialized', { db: !!db })
    return db
  } catch (error: any) {
    console.error('Error initializing Firebase:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    })
    db = undefined
    return undefined
  }
}

// Initialize on client side
if (typeof window !== 'undefined' && !initializationAttempted) {
  initializationAttempted = true
  db = initializeFirebase()
}

// Export a function to get db (re-initializes if needed)
export function getDb(): Firestore | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  if (!db) {
    db = initializeFirebase()
  }
  return db
}

// Export db for backward compatibility
export { db }

