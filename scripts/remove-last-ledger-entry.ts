/**
 * Script to remove the last ledger entry
 * 
 * Usage: npx ts-node scripts/remove-last-ledger-entry.ts
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, orderBy, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore'
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

async function removeLastLedgerEntry() {
  try {
    // Validate configuration
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      throw new Error('Firebase configuration is missing. Please check your .env.local file.')
    }

    console.log('🔥 Initializing Firebase...')
    const app = initializeApp(firebaseConfig)
    const db = getFirestore(app)
    console.log(`✅ Connected to project: ${firebaseConfig.projectId}`)

    console.log('\n📋 Fetching ledger entries...')
    const q = query(collection(db, 'ledgerEntries'), orderBy('date', 'desc'))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      console.log('❌ No ledger entries found.')
      return
    }

    // Get the first (most recent) entry
    const lastEntry = snapshot.docs[0]
    const data = lastEntry.data()

    // Convert date if it's a Timestamp
    let dateValue = data.date
    if (dateValue && typeof dateValue.toDate === 'function') {
      dateValue = (dateValue as Timestamp).toDate().toISOString()
    }

    console.log('\n📄 Last ledger entry:')
    console.log(`   ID: ${lastEntry.id}`)
    console.log(`   Type: ${data.type}`)
    console.log(`   Amount: ₹${data.amount}`)
    console.log(`   Date: ${dateValue}`)
    console.log(`   Note: ${data.note || '(no note)'}`)
    console.log(`   Source: ${data.source || 'manual'}`)

    console.log('\n🗑️  Deleting last entry...')
    await deleteDoc(doc(db, 'ledgerEntries', lastEntry.id))
    
    console.log('✅ Last ledger entry deleted successfully!')
  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    if (error.code) {
      console.error(`   Error code: ${error.code}`)
    }
    process.exit(1)
  }
}

// Run
removeLastLedgerEntry()

