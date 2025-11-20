/**
 * Database Import Script
 * Imports data from a JSON dump file back into Firestore
 * 
 * Usage: npx ts-node scripts/import-db.ts <dump-file.json>
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, Timestamp, getDocs, deleteDoc, query } from 'firebase/firestore'
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

interface ImportData {
  exportDate: string
  projectId: string
  orders?: any[]
  ledgerEntries?: any[]
  invoices?: any[]
  partyPayments?: any[]
  [key: string]: any
}

async function importDatabase(dumpFilePath: string, clearExisting: boolean = true) {
  try {
    // Validate configuration
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      throw new Error('Firebase configuration is missing. Please check your .env.local file.')
    }

    // Read dump file
    if (!fs.existsSync(dumpFilePath)) {
      throw new Error(`Dump file not found: ${dumpFilePath}`)
    }

    console.log(`📄 Reading dump file: ${dumpFilePath}...`)
    const fileContent = fs.readFileSync(dumpFilePath, 'utf-8')
    const importData: ImportData = JSON.parse(fileContent)

    console.log(`📅 Export date: ${importData.exportDate}`)
    console.log(`🔧 Project ID: ${importData.projectId}`)

    // Confirm project ID matches
    if (importData.projectId !== firebaseConfig.projectId) {
      console.warn(`⚠️  Warning: Dump file is from project "${importData.projectId}" but current project is "${firebaseConfig.projectId}"`)
      console.log('   Continuing anyway...')
    }

    console.log('\n🔥 Initializing Firebase...')
    const app = initializeApp(firebaseConfig)
    const db = getFirestore(app)
    console.log(`✅ Connected to project: ${firebaseConfig.projectId}`)

    // Get collections to import
    const collections = Object.keys(importData).filter(
      key => key !== 'exportDate' && key !== 'projectId'
    )

    // Clear existing data if requested
    if (clearExisting) {
      console.log('\n🗑️  Clearing existing data...')
      for (const collectionName of collections) {
        try {
          console.log(`   Clearing ${collectionName}...`)
          const collectionRef = collection(db, collectionName)
          const snapshot = await getDocs(collectionRef)
          
          let deleted = 0
          for (const docSnapshot of snapshot.docs) {
            await deleteDoc(doc(db, collectionName, docSnapshot.id))
            deleted++
          }
          console.log(`   ✅ Cleared ${deleted} documents from ${collectionName}`)
        } catch (error: any) {
          console.warn(`   ⚠️  Could not clear ${collectionName}: ${error.message}`)
        }
      }
    }

    for (const collectionName of collections) {
      const documents = importData[collectionName]
      
      if (!Array.isArray(documents) || documents.length === 0) {
        console.log(`\n⏭️  Skipping ${collectionName} (empty or invalid)`)
        continue
      }

      console.log(`\n📦 Importing collection: ${collectionName}...`)
      console.log(`   Found ${documents.length} documents`)

      let imported = 0
      let errors = 0

      for (const document of documents) {
        try {
          const { id, ...data } = document
          
          if (!id) {
            console.warn(`   ⚠️  Skipping document without ID`)
            errors++
            continue
          }

          // Process document data to convert ISO strings back to Timestamps where needed
          const processedData = processDocumentForImport(data, collectionName)

          const docRef = doc(collection(db, collectionName), id)
          // Use setDoc without merge to completely replace the document
          await setDoc(docRef, processedData)
          
          imported++
          if (imported % 10 === 0) {
            process.stdout.write(`   Progress: ${imported}/${documents.length}\r`)
          }
        } catch (error: any) {
          console.error(`   ❌ Error importing document ${document.id}:`, error.message)
          if (error.code) {
            console.error(`      Error code: ${error.code}`)
          }
          if (error.stack) {
            console.error(`      Stack: ${error.stack.split('\n')[0]}`)
          }
          errors++
        }
      }

      console.log(`   ✅ Imported ${imported} documents`)
      if (errors > 0) {
        console.log(`   ⚠️  ${errors} errors`)
      }
    }

    console.log(`\n✅ Database import completed!`)
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message)
    process.exit(1)
  }
}

// Process document data for import - convert ISO strings to Timestamps where appropriate
function processDocumentForImport(data: any, collectionName?: string): any {
  if (data === null || data === undefined) {
    return data
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => processDocumentForImport(item, collectionName))
  }

  // Handle objects
  if (typeof data === 'object') {
    const processed: any = {}
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key]
        
        // Convert ISO timestamp strings to Firestore Timestamps
        if (typeof value === 'string') {
          // Check if it's a full ISO timestamp (has time component, not just a date)
          const isFullIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
          
          // Fields that should always be converted to Timestamps if they're full ISO timestamps
          const timestampFields = ['createdAt', 'updatedAt', 'createdAtTs', 'dueDate']
          
          // For 'date' field:
          // - In orders: keep as string (simple date like "2025-11-17")
          // - In ledgerEntries: convert to Timestamp if it's a full ISO timestamp
          // - In other collections: convert if it's a full ISO timestamp
          if (isFullIsoTimestamp) {
            if (timestampFields.includes(key)) {
              // Always convert timestamp fields
              try {
                processed[key] = Timestamp.fromDate(new Date(value))
              } catch (e) {
                processed[key] = value
              }
            } else if (key === 'date') {
              // For 'date' field, check collection type
              if (collectionName === 'orders') {
                // Keep as string for orders (simple date format)
                processed[key] = value
              } else {
                // Convert to Timestamp for other collections (ledger entries, etc.)
                try {
                  processed[key] = Timestamp.fromDate(new Date(value))
                } catch (e) {
                  processed[key] = value
                }
              }
            } else {
              // For other fields that are ISO timestamps, convert them
              try {
                processed[key] = Timestamp.fromDate(new Date(value))
              } catch (e) {
                processed[key] = value
              }
            }
          } else {
            // Not a full ISO timestamp, keep as string
            processed[key] = processDocumentForImport(value, collectionName)
          }
        } else {
          processed[key] = processDocumentForImport(value, collectionName)
        }
      }
    }
    return processed
  }

  return data
}

// Get dump file path from command line argument
const dumpFilePath = process.argv[2]
const clearExisting = process.argv[3] !== '--no-clear'

if (!dumpFilePath) {
  console.error('❌ Error: Please provide the path to the dump file')
  console.log('\nUsage: npx ts-node scripts/import-db.ts <dump-file.json> [--no-clear]')
  console.log('\nExample: npx ts-node scripts/import-db.ts db-dump-2024-01-15T10-30-00.json')
  console.log('\nOptions:')
  console.log('  --no-clear  Keep existing data and merge (default: clear all existing data)')
  process.exit(1)
}

// Resolve file path
const resolvedPath = path.isAbsolute(dumpFilePath)
  ? dumpFilePath
  : path.join(process.cwd(), dumpFilePath)

// Run import
importDatabase(resolvedPath, clearExisting)

