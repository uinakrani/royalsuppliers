/**
 * Reset Raw Material Payments Script
 * Removes all partial payments for raw materials and sets all orders to "due" status
 * 
 * Usage: npm run reset-raw-material-payments
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore'
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

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const ORDERS_COLLECTION = 'orders'
const LEDGER_COLLECTION = 'ledgerEntries'

interface PaymentRecord {
  id: string
  amount: number
  date: string
}

interface Order {
  id: string
  partialPayments?: PaymentRecord[]
  paidAmount?: number
  paid?: boolean
  paymentDue?: boolean
  originalTotal?: number
  partyName?: string
  siteName?: string
}

async function resetRawMaterialPayments() {
  try {
    console.log('🔄 Starting to reset raw material payments...\n')

    // Get all orders
    const ordersRef = collection(db, ORDERS_COLLECTION)
    const ordersSnapshot = await getDocs(ordersRef)
    
    const orders: Order[] = []
    ordersSnapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() } as Order)
    })

    console.log(`📦 Found ${orders.length} orders\n`)

    let updatedCount = 0
    let totalPaymentsRemoved = 0
    let totalAmountRemoved = 0

    // Process each order
    for (const order of orders) {
      const hasPayments = order.partialPayments && order.partialPayments.length > 0
      const hasPaidAmount = order.paidAmount && order.paidAmount > 0
      const isPaid = order.paid === true

      // Only process orders that have payments or are marked as paid
      if (hasPayments || hasPaidAmount || isPaid) {
        console.log(`Processing order ${order.id}...`)
        
        // Calculate total amount to remove
        let amountToRemove = 0
        if (order.partialPayments && order.partialPayments.length > 0) {
          amountToRemove = order.partialPayments.reduce((sum, p) => sum + p.amount, 0)
          totalPaymentsRemoved += order.partialPayments.length
        } else if (order.paidAmount) {
          amountToRemove = order.paidAmount
        } else if (isPaid && order.originalTotal) {
          amountToRemove = order.originalTotal
        }

        totalAmountRemoved += amountToRemove

        // Update order
        const orderRef = doc(db, ORDERS_COLLECTION, order.id)
        await updateDoc(orderRef, {
          partialPayments: deleteField(),
          paidAmount: deleteField(),
          paid: false,
          paymentDue: true,
          updatedAt: new Date().toISOString(),
        })

        console.log(`  ✓ Reset order ${order.id} (removed ${amountToRemove.toFixed(2)})\n`)
        updatedCount++
      }
    }

    console.log('\n📊 Summary:')
    console.log(`  - Orders updated: ${updatedCount}`)
    console.log(`  - Total payments removed: ${totalPaymentsRemoved}`)
    console.log(`  - Total amount removed: ${totalAmountRemoved.toFixed(2)}`)
    console.log('\n✅ All raw material payments have been reset!')
    console.log('⚠️  Note: Ledger entries for these payments are still in the ledger.')
    console.log('   You may want to manually review and remove them if needed.\n')

  } catch (error: any) {
    console.error('❌ Error resetting payments:', error)
    process.exit(1)
  }
}

// Run the script
resetRawMaterialPayments()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

