import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

// Access environment variables directly (no usage of 'window') in server context.
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

let db: Firestore | undefined

export function getServerDb(): Firestore | undefined {
    try {
        const config = getFirebaseConfig()
        // Validation
        if (!config.apiKey || !config.projectId) {
            console.warn('Firebase Server: Missing configuration')
            return undefined
        }

        const apps = getApps()
        let app: FirebaseApp

        // We can reuse the default app if it exists, or create a named one to avoid conflict
        // with client-side hydration if this code runs in a mixed context (though usually API routes are separate).
        // Using a specific name for server app to be safe.
        const APP_NAME = 'server-app'
        const serverApp = apps.find(a => a.name === APP_NAME)

        if (serverApp) {
            app = serverApp
        } else {
            app = initializeApp(config, APP_NAME)
        }

        if (!db) {
            db = getFirestore(app)
        }
        return db
    } catch (error) {
        console.error('Firebase Server Init Error:', error)
        return undefined
    }
}
