/**
 * Firebase Admin SDK setup for server-side operations
 * Used for database backups and file uploads
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let adminApp: App | null = null

export function getAdminApp(): App {
  if (adminApp) {
    return adminApp
  }

  // Check if already initialized
  const existingApps = getApps()
  if (existingApps.length > 0) {
    adminApp = existingApps[0]
    return adminApp
  }

  // Initialize with service account or use default credentials
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

  if (!projectId) {
    throw new Error('Firebase Project ID is not configured')
  }

  try {
    // Try to initialize with service account key (if provided)
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey)
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
      } catch {
        // Invalid JSON, fall back to default
      }
    }

    // If service account didn't work, use default credentials
    if (!adminApp) {
      adminApp = initializeApp({
        projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    }

    return adminApp
  } catch (error: any) {
    console.error('Error initializing Firebase Admin:', error)
    throw new Error(`Failed to initialize Firebase Admin: ${error.message}`)
  }
}

export function getAdminFirestore() {
  const app = getAdminApp()
  return getFirestore(app)
}

export function getAdminStorage() {
  const app = getAdminApp()
  return getStorage(app)
}

