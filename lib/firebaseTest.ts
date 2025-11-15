// Firebase connection test utility
// Can be called from browser console: window.testFirebase()

import { getDb } from './firebase'
import { collection, addDoc, getDocs, query, limit } from 'firebase/firestore'

export async function testFirebaseConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    console.log('🧪 Testing Firebase connection...')
    
    const db = getDb()
    
    if (!db) {
      return {
        success: false,
        message: 'Firebase db is not initialized',
        details: {
          env: {
            hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          }
        }
      }
    }

    console.log('✅ Firebase db initialized')

    // Test read operation
    try {
      const testQuery = query(collection(db, 'orders'), limit(1))
      await getDocs(testQuery)
      console.log('✅ Read test passed')
    } catch (readError: any) {
      console.error('❌ Read test failed:', readError)
      return {
        success: false,
        message: 'Read test failed',
        details: {
          code: readError?.code,
          message: readError?.message
        }
      }
    }

    // Test write operation
    try {
      const testDoc = {
        test: true,
        timestamp: new Date().toISOString(),
        _testMarker: true
      }
      const docRef = await addDoc(collection(db, 'orders'), testDoc)
      console.log('✅ Write test passed, created test doc:', docRef.id)
      
      // Clean up test doc (optional - you can delete it manually)
      return {
        success: true,
        message: 'Firebase connection test passed!',
        details: {
          testDocId: docRef.id,
          note: 'Test document created. You can delete it from Firebase Console if needed.'
        }
      }
    } catch (writeError: any) {
      console.error('❌ Write test failed:', writeError)
      return {
        success: false,
        message: 'Write test failed',
        details: {
          code: writeError?.code,
          message: writeError?.message,
          suggestion: writeError?.code === 'permission-denied' 
            ? 'Check Firestore security rules. They should allow: allow read, write: if true;'
            : 'Check your internet connection and Firebase configuration.'
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Firebase test error:', error)
    return {
      success: false,
      message: 'Test failed with error',
      details: {
        error: error?.message,
        stack: error?.stack
      }
    }
  }
}

// Make it available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).testFirebase = testFirebaseConnection
}

