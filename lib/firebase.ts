import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

// Get Firebase configuration based on environment
function getFirebaseConfig() {
  // Get environment (production or development) - check at runtime
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'production'
  
  if (environment === 'development') {
    // Development database configuration
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_DEV_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_DEV_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      environment: 'development'
    }
  } else {
    // Production database configuration (default)
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      environment: 'production'
    }
  }
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

  // Get config at runtime
  const firebaseConfig = getFirebaseConfig()
  
  // Check if Firebase is configured
  const isConfigured = firebaseConfig.apiKey && 
                       firebaseConfig.projectId && 
                       firebaseConfig.appId

  if (!isConfigured) {
    console.error('Firebase is not configured. Please create a .env.local file with your Firebase credentials.')
    console.error('Missing configuration:', {
      environment: firebaseConfig.environment || 'production',
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
    const environment = firebaseConfig.environment || 'production'
    
    // Check if we need to initialize a new app or use existing
    const existingApps = getApps()
    if (existingApps.length === 0) {
      // No apps initialized, create new one
      app = initializeApp(firebaseConfig)
      console.log('Firebase initialized successfully', {
        environment,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey?.substring(0, 10) + '...'
      })
    } else {
      // Use existing app (Firebase SDK handles multiple configs)
      app = existingApps[0]
      console.log('Using existing Firebase app', {
        environment,
        projectId: firebaseConfig.projectId
      })
    }
    db = getFirestore(app)
    console.log('Firestore database initialized', { environment, db: !!db })
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

// Expose the current Firebase app instance so other modules (auth/storage)
// can share a single initialization.
export function getFirebaseApp(): FirebaseApp | undefined {
  if (app) {
    return app
  }
  // Initialize if we haven't yet (client-only)
  if (typeof window !== 'undefined') {
    initializeFirebase()
    return app
  }
  return undefined
}

