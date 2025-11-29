/**
 * Daily Database Backup Script
 * Exports database dump for scheduled daily backups
 * Run this script via Windows Task Scheduler or cron job at 6 AM daily
 * 
 * Usage: npx ts-node scripts/daily-backup.ts
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
  backupType: 'daily'
  orders?: any[]
  ledgerEntries?: any[]
  invoices?: any[]
  partyPayments?: any[]
  [key: string]: any
}

async function exportDailyBackup() {
  try {
    // Validate configuration
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      throw new Error('Firebase configuration is missing. Please check your .env.local file.')
    }

    console.log('🔥 Initializing Firebase for daily backup...')
    const app = initializeApp(firebaseConfig)
    const db = getFirestore(app)
    console.log(`✅ Connected to project: ${firebaseConfig.projectId}`)

    const exportData: ExportData = {
      exportDate: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
      backupType: 'daily',
    }

    // Export each collection
    for (const collectionName of COLLECTIONS) {
      console.log(`📦 Exporting collection: ${collectionName}...`)
      
      try {
        const collectionRef = collection(db, collectionName)
        const snapshot = await getDocs(collectionRef)
        
        const documents: any[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
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

    // Determine output directory
    const rootDir = path.join(__dirname, '..')
    const backupsDir = path.join(rootDir, 'backups')
    
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }

    // Create daily backups subdirectory
    const dailyBackupsDir = path.join(backupsDir, 'daily')
    if (!fs.existsSync(dailyBackupsDir)) {
      fs.mkdirSync(dailyBackupsDir, { recursive: true })
    }

    // Generate filename with date (YYYY-MM-DD format)
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = today.toTimeString().split(' ')[0].replace(/:/g, '-') // HH-MM-SS
    const filename = `db-dump-daily-${dateStr}-${timeStr}.json`
    const filepath = path.join(dailyBackupsDir, filename)

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8')

    console.log(`\n✅ Daily database backup completed!`)
    console.log(`📄 File saved to: ${filepath}`)
    console.log(`\nSummary:`)
    COLLECTIONS.forEach((col) => {
      console.log(`   ${col}: ${exportData[col]?.length || 0} documents`)
    })

    // Log backup to a log file
    const logFile = path.join(dailyBackupsDir, 'backup-log.txt')
    const logEntry = `${new Date().toISOString()} - Backup completed: ${filename} (${Object.values(exportData).reduce((acc, val) => {
      if (Array.isArray(val)) return acc + val.length
      return acc
    }, 0)} total documents)\n`
    fs.appendFileSync(logFile, logEntry, 'utf-8')

    return filepath
  } catch (error: any) {
    console.error('\n❌ Daily backup failed:', error.message)
    // Log error to log file
    try {
      const rootDir = path.join(__dirname, '..')
      const backupsDir = path.join(rootDir, 'backups', 'daily')
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true })
      }
      const logFile = path.join(backupsDir, 'backup-log.txt')
      const errorLog = `${new Date().toISOString()} - ERROR: ${error.message}\n`
      fs.appendFileSync(logFile, errorLog, 'utf-8')
    } catch (logError) {
      // Ignore log errors
    }
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

// Run export
exportDailyBackup()

