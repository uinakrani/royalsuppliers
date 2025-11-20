import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDb } from './firebase'

export type LedgerType = 'credit' | 'debit'
export type LedgerSource = 'manual' | 'partyPayment' | 'invoicePayment' | 'orderExpense' | 'orderProfit' | 'orderPaymentUpdate'

export interface LedgerEntry {
  id?: string
  type: LedgerType
  amount: number
  note?: string
  date: string // ISO timestamp
  createdAt?: string
  source?: LedgerSource
}

const LEDGER_COLLECTION = 'ledgerEntries'

export const ledgerService = {
  async addEntry(type: LedgerType, amount: number, note?: string, source: LedgerSource = 'manual', date?: string): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    const now = new Date().toISOString()
    // Use provided date or default to now
    // If date is provided, convert it to ISO string with time component
    let dateValue = date || now
    if (date && !date.includes('T')) {
      // If date is just YYYY-MM-DD, add time component
      dateValue = new Date(date + 'T00:00:00').toISOString()
    }
    const payload: any = {
      type,
      amount,
      date: dateValue,
      createdAt: now,
      source,
    }
    if (note && note.trim()) {
      payload.note = note.trim()
    }
    const ref = await addDoc(collection(db, LEDGER_COLLECTION), {
      ...payload,
      createdAtTs: serverTimestamp(),
    })
    return ref.id
  },

  async list(): Promise<LedgerEntry[]> {
    const db = getDb()
    if (!db) return []
    // Query by date (has index), then sort by creation time in JavaScript
    const q = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
    const snap = await getDocs(q)
    const items: LedgerEntry[] = []
    snap.forEach((d) => {
      const data = d.data() as any
      const createdAt =
        data.createdAt ??
        (data.createdAtTs && (data.createdAtTs as Timestamp).toDate().toISOString()) ??
        undefined
      
      // Convert date field from Timestamp to ISO string if needed
      let dateValue = data.date
      if (dateValue && typeof dateValue.toDate === 'function') {
        dateValue = (dateValue as Timestamp).toDate().toISOString()
      }
      
      items.push({
        id: d.id,
        type: data.type,
        amount: data.amount,
        note: data.note,
        date: dateValue,
        source: data.source,
        ...(createdAt ? { createdAt } : {}),
      })
    })
    
    // Sort by creation time (most recent first) - use createdAt, then date as fallback
    // This ensures the latest added entries appear at the top
    items.sort((a, b) => {
      const aTime = a.createdAt 
        ? new Date(a.createdAt).getTime()
        : (a.date ? new Date(a.date).getTime() : 0)
      const bTime = b.createdAt 
        ? new Date(b.createdAt).getTime()
        : (b.date ? new Date(b.date).getTime() : 0)
      return bTime - aTime // Descending order (newest first)
    })
    
    return items
  },

  subscribe(callback: (entries: LedgerEntry[]) => void): () => void {
    const db = getDb()
    if (!db) return () => {}
    // Query by date (has index), then sort by creation time in JavaScript
    const qRef = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
    return onSnapshot(qRef, (snap) => {
      const items: LedgerEntry[] = []
      snap.forEach((d) => {
        const data = d.data() as any
        const createdAt =
          data.createdAt ??
          (data.createdAtTs && (data.createdAtTs as Timestamp).toDate().toISOString()) ??
          undefined
        
        // Convert date field from Timestamp to ISO string if needed
        let dateValue = data.date
        if (dateValue && typeof dateValue.toDate === 'function') {
          dateValue = (dateValue as Timestamp).toDate().toISOString()
        }
        
        items.push({
          id: d.id,
          type: data.type,
          amount: data.amount,
          note: data.note,
          date: dateValue,
          source: data.source,
          ...(createdAt ? { createdAt } : {}),
        })
      })
      
      // Sort by creation time (most recent first) - use createdAt, then date as fallback
      // This ensures the latest added entries appear at the top
      items.sort((a, b) => {
        const aTime = a.createdAt 
          ? new Date(a.createdAt).getTime()
          : (a.date ? new Date(a.date).getTime() : 0)
        const bTime = b.createdAt 
          ? new Date(b.createdAt).getTime()
          : (b.date ? new Date(b.date).getTime() : 0)
        return bTime - aTime // Descending order (newest first)
      })
      
      callback(items)
    })
  },

  async getBalance(): Promise<number> {
    const entries = await this.list()
    return entries.reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
  },

  async remove(id: string): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    await deleteDoc(doc(db, LEDGER_COLLECTION, id))
  },

  async removeLastEntry(): Promise<void> {
    const entries = await this.list()
    if (entries.length === 0) {
      throw new Error('No ledger entries found')
    }
    // Entries are already sorted by date desc, so first entry is the most recent
    const lastEntry = entries[0]
    if (!lastEntry.id) {
      throw new Error('Last entry does not have an ID')
    }
    await this.remove(lastEntry.id)
  },

  async update(id: string, updates: { amount?: number; note?: string; date?: string }): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    const entryRef = doc(db, LEDGER_COLLECTION, id)
    const updateData: any = {}
    
    if (updates.amount !== undefined) {
      updateData.amount = updates.amount
    }
    
    if (updates.note !== undefined) {
      if (updates.note && updates.note.trim()) {
        updateData.note = updates.note.trim()
      } else {
        updateData.note = null // Remove note if empty
      }
    }
    
    if (updates.date !== undefined) {
      let dateValue = updates.date
      if (dateValue && !dateValue.includes('T')) {
        // If date is just YYYY-MM-DD, add time component
        dateValue = new Date(dateValue + 'T00:00:00').toISOString()
      }
      updateData.date = dateValue
    }
    
    await updateDoc(entryRef, updateData)
  },
}


