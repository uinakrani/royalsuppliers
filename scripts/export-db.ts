/**
 * Database Export Script
 * Exports all Firestore collections to a JSON file that can be imported later
 * 
 * Usage: npx ts-node scripts/export-db.ts
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Collections to export
const COLLECTIONS = [
  'orders',
  'ledgerEntries',
  'invoices',
  'partyPayments'
]

interface ExportData {
  exportDate: string
  projectId: string
  orders?: any[]
  ledgerEntries?: any[]
  invoices?: any[]
  partyPayments?: any[]
  [key: string]: any
}

async function exportDatabase() {
  try {
    // Validate configuration
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      throw new Error('Firebase configuration is missing. Please check your .env.local file.')
    }

    console.log('🔥 Initializing Firebase...')
    const app = initializeApp(firebaseConfig)
    const db = getFirestore(app)
    console.log(`✅ Connected to project: ${firebaseConfig.projectId}`)

    const exportData: ExportData = {
      exportDate: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
    }

    // Export each collection
    for (const collectionName of COLLECTIONS) {
      console.log(`\n📦 Exporting collection: ${collectionName}...`)
      
      try {
        const collectionRef = collection(db, collectionName)
        const snapshot = await getDocs(collectionRef)
        
        const documents: any[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          // Convert Firestore Timestamps to ISO strings
          const processedData = processDocument(data)
          documents.push({
            id: doc.id,
            ...processedData,
          })
        })

        exportData[collectionName] = documents
        console.log(`   ✅ Exported ${documents.length} documents`)
      } catch (error: any) {
        console.error(`   ❌ Error exporting ${collectionName}:`, error.message)
        exportData[collectionName] = []
      }
    }

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `db-dump-${timestamp}.json`
    const filepath = path.join(__dirname, '..', filename)

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8')

    console.log(`\n✅ Database export completed!`)
    console.log(`📄 File saved to: ${filepath}`)
    console.log(`\nSummary:`)
    COLLECTIONS.forEach((col) => {
      console.log(`   ${col}: ${exportData[col]?.length || 0} documents`)
    })

    return filepath
  } catch (error: any) {
    console.error('\n❌ Export failed:', error.message)
    process.exit(1)
  }
}

// Recursively process document data to convert Firestore types to JSON-serializable formats
function processDocument(data: any): any {
  if (data === null || data === undefined) {
    return data
  }

  // Handle Firestore Timestamp
  if (data && typeof data.toDate === 'function') {
    try {
      return data.toDate().toISOString()
    } catch (e) {
      // If toDate() fails, try to get seconds and nanoseconds
      if (data.seconds !== undefined) {
        const date = new Date(data.seconds * 1000 + (data.nanoseconds || 0) / 1000000)
        return date.toISOString()
      }
      return data.toString()
    }
  }

  // Handle Firestore Timestamp-like objects (with seconds/nanoseconds)
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try {
      const date = new Date(data.seconds * 1000 + (data.nanoseconds || 0) / 1000000)
      return date.toISOString()
    } catch (e) {
      return data.toString()
    }
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => processDocument(item))
  }

  // Handle objects (but not Date objects, which are already handled)
  if (typeof data === 'object' && !(data instanceof Date)) {
    const processed: any = {}
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        processed[key] = processDocument(data[key])
      }
    }
    return processed
  }

  // Handle Date objects (shouldn't happen in Firestore, but just in case)
  if (data instanceof Date) {
    return data.toISOString()
  }

  return data
}

// Run export
exportDatabase()

