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

const PARTY_PAYMENTS_COLLECTION = 'partyPayments'

export interface PartyPayment {
  id?: string
  partyName: string
  amount: number
  date: string // ISO date string
  note?: string
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
      const paymentData: any = {
        partyName,
        amount,
        date: now,
        createdAt: now,
        updatedAt: now,
      }
      if (note && note.trim()) {
        paymentData.note = note.trim()
      }
      
      const docRef = await addDoc(collection(db, PARTY_PAYMENTS_COLLECTION), paymentData)
      console.log('✅ Party payment added successfully with ID:', docRef.id)

      // Create a ledger credit entry for this payment (income - best-effort)
      try {
        const ledgerNote = note && note.trim() 
          ? `Income from ${partyName}: ${note.trim()}` 
          : `Income from ${partyName}`
        await ledgerService.addEntry('credit', amount, ledgerNote, 'partyPayment', now)
      } catch (e) {
        console.warn('Ledger entry for party payment failed (non-fatal):', e)
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

