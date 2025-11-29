/**
 * Export Database for Git Commit
 * Exports database dump with commit hash in filename
 * Used by git post-commit hook
 * 
 * Usage: npx ts-node scripts/export-db-for-commit.ts <output-dir> <commit-hash>
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

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
  commitHash?: string
  commitMessage?: string
  branch?: string
  orders?: any[]
  ledgerEntries?: any[]
  invoices?: any[]
  partyPayments?: any[]
  [key: string]: any
}

// Get git version information
function getGitVersionInfo(commitHash?: string): { commitHash?: string; branch?: string; tag?: string; commitMessage?: string; author?: string } | undefined {
  try {
    const isGitRepo = fs.existsSync(path.join(__dirname, '..', '.git'))
    if (!isGitRepo) {
      return undefined
    }

    try {
      const hash = commitHash || execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
      const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
      const author = execSync('git log -1 --pretty=%an', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
      
      let tag: string | undefined
      try {
        tag = execSync('git describe --exact-match --tags HEAD', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
      } catch {
        // No tag found, that's okay
      }

      return {
        commitHash: hash || undefined,
        branch: branch || undefined,
        tag: tag || undefined,
        commitMessage: commitMessage || undefined,
        author: author || undefined,
      }
    } catch (error) {
      // Git commands failed, return undefined
      return undefined
    }
  } catch {
    return undefined
  }
}

async function exportDatabaseForCommit(outputDir?: string, commitHash?: string) {
  try {
    // Validate configuration
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      throw new Error('Firebase configuration is missing. Please check your .env.local file.')
    }

    console.log('🔥 Initializing Firebase...')
    const app = initializeApp(firebaseConfig)
    const db = getFirestore(app)
    console.log(`✅ Connected to project: ${firebaseConfig.projectId}`)

    // Get version info
    const versionInfo = getGitVersionInfo(commitHash)
    const actualCommitHash = commitHash || versionInfo?.commitHash

    if (versionInfo && actualCommitHash) {
      console.log(`\n📌 Version Info:`)
      console.log(`   Commit: ${actualCommitHash.substring(0, 8)}`)
      if (versionInfo.branch) console.log(`   Branch: ${versionInfo.branch}`)
      if (versionInfo.tag) console.log(`   Tag: ${versionInfo.tag}`)
    }

    const exportData: ExportData = {
      exportDate: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
      commitHash: actualCommitHash,
      commitMessage: versionInfo?.commitMessage,
      branch: versionInfo?.branch,
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
    const backupsDir = outputDir || path.join(rootDir, 'backups')
    
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }

    // Generate filename with commit hash
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    let filename: string
    
    if (actualCommitHash) {
      const shortHash = actualCommitHash.substring(0, 8)
      filename = `db-dump-${timestamp}-${shortHash}.json`
    } else {
      filename = `db-dump-${timestamp}.json`
    }
    
    const filepath = path.join(backupsDir, filename)

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

// Get command line arguments
const outputDir = process.argv[2] || undefined
const commitHash = process.argv[3] || undefined

// Run export
exportDatabaseForCommit(outputDir, commitHash)

