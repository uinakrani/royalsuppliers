import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  deleteField
} from 'firebase/firestore'
import { getDb } from './firebase'
import { ledgerService } from './ledgerService'
import { orderService, isCustomerPaid } from './orderService'
import { Order, PaymentRecord } from '@/types/order'

const PARTY_PAYMENTS_COLLECTION = 'partyPayments'

export interface PartyPayment {
  id?: string
  partyName: string
  amount: number
  date: string // ISO date string
  note?: string
  ledgerEntryId?: string // Link to ledger entry if created from ledger
  createdAt?: string
  updatedAt?: string
}

export const partyPaymentService = {
  // Add payment for a party
  async addPayment(partyName: string, amount: number, note?: string): Promise<string> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    
    try {
      const now = new Date().toISOString()

      // 1) Create a ledger credit entry linked to this party payment
      const ledgerEntryId = await ledgerService.addEntry(
        'credit',
        amount,
        note,
        'partyPayment',
        now,
        undefined,
        partyName,
      )

      // 2) Create a record in partyPayments collection, linked to the ledger entry
      const paymentData: any = {
        partyName,
        amount,
        date: now,
        ledgerEntryId,
        createdAt: now,
        updatedAt: now,
      }
      if (note && note.trim()) {
        paymentData.note = note.trim()
      }

      const docRef = await addDoc(collection(db, PARTY_PAYMENTS_COLLECTION), paymentData)
      console.log('✅ Party payment added successfully with ID:', docRef.id, 'and ledger entry:', ledgerEntryId)

      // 3) Distribute income across the party's unpaid orders as read-only payments (linked to ledgerEntryId)
      const allOrders = await orderService.getAllOrders({ partyName })
      if (allOrders.length === 0) {
        return docRef.id
      }

      // Build list of unpaid/partially paid orders, excluding payments from this ledger entry
      const ordersWithOutstanding = allOrders
        .map((order) => {
          const existingPayments = order.customerPayments || []
          const paymentsExcludingThis = existingPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
          const totalPaid = paymentsExcludingThis.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          const sellingTotal = Number(order.total || 0)
          const remaining = Math.max(0, sellingTotal - totalPaid)

          const tempOrder: Order = { ...order, customerPayments: paymentsExcludingThis }
          const isPaid = isCustomerPaid(tempOrder)

          return { order, remaining, currentPayments: existingPayments, isPaid, totalPaid, sellingTotal }
        })
        .filter(({ remaining, isPaid }) => remaining > 0 && !isPaid)
        .sort((a, b) => {
          const aDate = new Date(a.order.date).getTime()
          const bDate = new Date(b.order.date).getTime()
          if (aDate !== bDate) return aDate - bDate
          const aTime = safeGetTime(a.order.createdAt || a.order.updatedAt || a.order.date)
          const bTime = safeGetTime(b.order.createdAt || b.order.updatedAt || b.order.date)
          return aTime - bTime
        })

      let remainingIncome = amount
      const paymentsToApply: Array<{ orderId: string; updatedPayments: PaymentRecord[] }> = []

      for (const { order, remaining, currentPayments } of ordersWithOutstanding) {
        if (remainingIncome <= 0) break
        if (!order.id) continue

        const paymentAmount = Math.min(remainingIncome, remaining)

        const payment: PaymentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: paymentAmount,
          date: now,
          note: 'From ledger entry',
          ledgerEntryId,
        }

        const paymentsWithoutThisEntry = currentPayments.filter(p => p.ledgerEntryId !== ledgerEntryId)
        const updatedPayments = [...paymentsWithoutThisEntry, payment]

        paymentsToApply.push({ orderId: order.id, updatedPayments })
        remainingIncome -= paymentAmount
      }

      // Apply updates to orders
      for (const { orderId, updatedPayments } of paymentsToApply) {
        await orderService.updateOrder(orderId, { customerPayments: updatedPayments })
      }

      return docRef.id
    } catch (error: any) {
      console.error('Error adding party payment:', error)
      throw new Error(`Failed to add payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Get all payments for a party
  async getPaymentsByParty(partyName: string): Promise<PartyPayment[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    
    try {
      const q = query(
        collection(db, PARTY_PAYMENTS_COLLECTION),
        where('partyName', '==', partyName),
        orderBy('date', 'desc')
      )
      
      const querySnapshot = await getDocs(q)
      const payments: PartyPayment[] = []
      
      querySnapshot.forEach((doc) => {
        payments.push({
          id: doc.id,
          ...doc.data(),
        } as PartyPayment)
      })
      
      return payments
    } catch (error: any) {
      console.error('Error fetching party payments:', error)
      return []
    }
  },

  // Get all payments
  async getAllPayments(): Promise<PartyPayment[]> {
    const db = getDb()
    if (!db) {
      console.warn('Firebase is not configured. Returning empty array.')
      return []
    }
    
    try {
      const q = query(
        collection(db, PARTY_PAYMENTS_COLLECTION),
        orderBy('date', 'desc')
      )
      
      const querySnapshot = await getDocs(q)
      const payments: PartyPayment[] = []
      
      querySnapshot.forEach((doc) => {
        payments.push({
          id: doc.id,
          ...doc.data(),
        } as PartyPayment)
      })
      
      return payments
    } catch (error: any) {
      console.error('Error fetching all payments:', error)
      return []
    }
  },

  // Remove a payment
  async removePayment(paymentId: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase is not configured.')
    }
    
    try {
      await deleteDoc(doc(db, PARTY_PAYMENTS_COLLECTION, paymentId))
      console.log('✅ Party payment removed successfully')
    } catch (error: any) {
      console.error('Error removing party payment:', error)
      throw new Error(`Failed to remove payment: ${error.message || 'Unknown error'}`)
    }
  },

  // Get total paid amount for a party
  async getTotalPaidByParty(partyName: string): Promise<number> {
    const payments = await this.getPaymentsByParty(partyName)
    return payments.reduce((sum, payment) => sum + payment.amount, 0)
  },
}

const safeGetTime = (dateString: string | null | undefined): number => {
  if (!dateString) return 0
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? 0 : date.getTime()
}

