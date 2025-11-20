/**
 * Copy Production Database to Development Database
 * Copies all data from production Firebase project to development Firebase project
 * 
 * Usage: npx ts-node scripts/copy-prod-to-dev.ts
 * 
 * Make sure you have both production and development Firebase configs in .env.local
 */

import { initializeApp, FirebaseApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, Timestamp, Firestore } from 'firebase/firestore'
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

// Production Firebase configuration
// Try both NEXT_PUBLIC_ prefixed and non-prefixed versions
const prodConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
}

// Development Firebase configuration
const devConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_DEV_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_DEV_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Collections to copy
const COLLECTIONS = [
  'orders',
  'ledgerEntries',
  'invoices',
  'partyPayments'
]

// Recursively process document data to convert Firestore types
function processDocument(data: any): any {
  if (data === null || data === undefined) {
    return data
  }

  // Handle Firestore Timestamp
  if (data && typeof data.toDate === 'function') {
    try {
      return data.toDate().toISOString()
    } catch (e) {
      if (data.seconds !== undefined) {
        const date = new Date(data.seconds * 1000 + (data.nanoseconds || 0) / 1000000)
        return date.toISOString()
      }
      return data.toString()
    }
  }

  // Handle Firestore Timestamp-like objects
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

  // Handle objects
  if (typeof data === 'object' && !(data instanceof Date)) {
    const processed: any = {}
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        processed[key] = processDocument(data[key])
      }
    }
    return processed
  }

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString()
  }

  return data
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
          const isFullIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
          const timestampFields = ['createdAt', 'updatedAt', 'createdAtTs', 'dueDate']
          
          if (isFullIsoTimestamp) {
            if (timestampFields.includes(key)) {
              try {
                processed[key] = Timestamp.fromDate(new Date(value))
              } catch (e) {
                processed[key] = value
              }
            } else if (key === 'date') {
              if (collectionName === 'orders') {
                processed[key] = value
              } else {
                try {
                  processed[key] = Timestamp.fromDate(new Date(value))
                } catch (e) {
                  processed[key] = value
                }
              }
            } else {
              try {
                processed[key] = Timestamp.fromDate(new Date(value))
              } catch (e) {
                processed[key] = value
              }
            }
          } else {
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

async function copyDatabase() {
  try {
    // Debug: Show what we found
    console.log('🔍 Checking configuration...')
    console.log('Production config:', {
      hasApiKey: !!prodConfig.apiKey,
      hasProjectId: !!prodConfig.projectId,
      hasAppId: !!prodConfig.appId,
      projectId: prodConfig.projectId || '(missing)'
    })
    console.log('Development config:', {
      hasApiKey: !!devConfig.apiKey,
      hasProjectId: !!devConfig.projectId,
      hasAppId: !!devConfig.appId,
      projectId: devConfig.projectId || '(missing)'
    })
    
    // Validate production configuration
    if (!prodConfig.apiKey || !prodConfig.projectId || !prodConfig.appId) {
      console.error('\n❌ Production Firebase configuration is missing!')
      console.error('Required variables:')
      console.error('  - NEXT_PUBLIC_FIREBASE_API_KEY')
      console.error('  - NEXT_PUBLIC_FIREBASE_PROJECT_ID')
      console.error('  - NEXT_PUBLIC_FIREBASE_APP_ID')
      console.error('\nPlease check your .env.local file and ensure these variables are set.')
      throw new Error('Production Firebase configuration is missing. Please check your .env.local file.')
    }

    // Validate development configuration
    if (!devConfig.apiKey || !devConfig.projectId || !devConfig.appId) {
      console.error('\n❌ Development Firebase configuration is missing!')
      console.error('Required variables:')
      console.error('  - NEXT_PUBLIC_FIREBASE_DEV_API_KEY')
      console.error('  - NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID')
      console.error('  - NEXT_PUBLIC_FIREBASE_DEV_APP_ID')
      console.error('\nPlease add these variables to your .env.local file.')
      console.error('If you want to use the same database for both, you can set:')
      console.error('  NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID=<same-as-production>')
      throw new Error('Development Firebase configuration is missing. Please set NEXT_PUBLIC_FIREBASE_DEV_* variables in .env.local')
    }

    // Check if dev project ID is different from prod
    if (prodConfig.projectId === devConfig.projectId) {
      console.warn('⚠️  Warning: Production and Development project IDs are the same!')
      console.warn('   This will overwrite your production data!')
      console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    console.log('🔥 Initializing Firebase connections...')
    console.log(`📊 Production: ${prodConfig.projectId}`)
    console.log(`🔧 Development: ${devConfig.projectId}`)
    
    const prodApp = initializeApp(prodConfig, 'production')
    const devApp = initializeApp(devConfig, 'development')
    
    const prodDb = getFirestore(prodApp)
    const devDb = getFirestore(devApp)
    
    console.log('✅ Connected to both databases\n')

    // Copy each collection
    for (const collectionName of COLLECTIONS) {
      console.log(`📦 Copying collection: ${collectionName}...`)
      
      try {
        // Read from production
        const prodCollectionRef = collection(prodDb, collectionName)
        const prodSnapshot = await getDocs(prodCollectionRef)
        
        const documents: any[] = []
        prodSnapshot.forEach((doc) => {
          const data = doc.data()
          const processedData = processDocument(data)
          documents.push({
            id: doc.id,
            ...processedData,
          })
        })

        console.log(`   📥 Read ${documents.length} documents from production`)

        if (documents.length === 0) {
          console.log(`   ⏭️  Skipping (no documents)`)
          continue
        }

        // Clear existing data in development
        console.log(`   🗑️  Clearing existing data in development...`)
        const devCollectionRef = collection(devDb, collectionName)
        const devSnapshot = await getDocs(devCollectionRef)
        
        let deleted = 0
        for (const docSnapshot of devSnapshot.docs) {
          try {
            await deleteDoc(doc(devDb, collectionName, docSnapshot.id))
            deleted++
          } catch (e: any) {
            console.warn(`   ⚠️  Could not delete document ${docSnapshot.id}: ${e.message}`)
          }
        }
        console.log(`   ✅ Cleared ${deleted} existing documents`)

        // Write to development
        console.log(`   📤 Writing to development...`)
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

            const processedData = processDocumentForImport(data, collectionName)
            const docRef = doc(devDb, collectionName, id)
            await setDoc(docRef, processedData)
            
            imported++
            if (imported % 10 === 0) {
              process.stdout.write(`   Progress: ${imported}/${documents.length}\r`)
            }
          } catch (error: any) {
            console.error(`   ❌ Error copying document ${document.id}:`, error.message)
            errors++
          }
        }

        console.log(`   ✅ Copied ${imported} documents to development`)
        if (errors > 0) {
          console.log(`   ⚠️  ${errors} errors`)
        }
      } catch (error: any) {
        console.error(`   ❌ Error copying ${collectionName}:`, error.message)
      }
    }

    console.log(`\n✅ Database copy completed!`)
    console.log(`\nSummary:`)
    console.log(`   Production: ${prodConfig.projectId}`)
    console.log(`   Development: ${devConfig.projectId}`)
    console.log(`\n⚠️  Remember to set NEXT_PUBLIC_ENVIRONMENT=development in .env.local to use the development database`)

  } catch (error: any) {
    console.error('\n❌ Copy failed:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run copy
copyDatabase()

