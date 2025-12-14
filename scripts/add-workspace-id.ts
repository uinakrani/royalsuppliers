/**
 * Migration: add workspaceId to all existing Firestore documents so they belong
 * to the default "Royal Construction" workspace.
 *
 * Usage: npx ts-node scripts/add-workspace-id.ts
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load env from .env.local if present
const envPath = path.join(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
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

const DEFAULT_WORKSPACE_ID = 'royal-construction'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const TARGET_COLLECTIONS = [
  // Core business data
  'orders',
  'suppliers',
  'parties',
  'invoices',
  'ledgerEntries',
  // Investments + related activity
  'investment',
  'investments',
  'investmentActivity',
  // Payments/parties
  'partyPayments',
  // Activity / timeline logs
  'ledgerActivities',
  'timelineLogs',
  'ledgerLogs',
]

async function ensureWorkspaceId() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error('Missing Firebase config. Populate .env.local first.')
  }

  console.log('Initializing Firebase...')
  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)
  console.log(`Connected to project: ${firebaseConfig.projectId}`)

  for (const coll of TARGET_COLLECTIONS) {
    console.log(`\nProcessing collection: ${coll}`)
    const snap = await getDocs(collection(db, coll))
    let updated = 0
    let total = 0
    for (const docSnap of snap.docs) {
      total += 1
      const data = docSnap.data() as any
      if (data.workspaceId === DEFAULT_WORKSPACE_ID) continue
      try {
        await setDoc(
          doc(db, coll, docSnap.id),
          { workspaceId: DEFAULT_WORKSPACE_ID },
          { merge: true }
        )
        updated += 1
      } catch (err) {
        console.error(`  ❌ Failed to update ${coll}/${docSnap.id}:`, (err as any)?.message || err)
      }
    }
    console.log(`  Done. Updated ${updated}/${total} docs.`)
  }

  console.log('\n✅ Migration complete.')
}

ensureWorkspaceId().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

