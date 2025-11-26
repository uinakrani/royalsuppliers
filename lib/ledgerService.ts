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
import { ledgerActivityService } from './ledgerActivityService'

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
  supplier?: string // For expense entries - supplier of raw materials
  partyName?: string // For income entries - party from which payment received
}

const LEDGER_COLLECTION = 'ledgerEntries'

export const ledgerService = {
  async addEntry(
    type: LedgerType, 
    amount: number, 
    note?: string, 
    source: LedgerSource = 'manual', 
    date?: string,
    supplier?: string,
    partyName?: string
  ): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    const now = new Date().toISOString()
    // Use provided date or default to now
    // If date is provided, convert it to ISO string with time component
    let dateValue = date || now
    if (date && !date.includes('T')) {
      // If date is just YYYY-MM-DD, parse it as local time (not UTC) to avoid timezone shifts
      // Parse YYYY-MM-DD in local timezone
      const [year, month, day] = date.split('-').map(Number)
      const localDate = new Date(year, month - 1, day, 12, 0, 0) // Use noon to avoid DST issues
      dateValue = localDate.toISOString()
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
    if (supplier && supplier.trim()) {
      payload.supplier = supplier.trim()
    }
    if (partyName && partyName.trim()) {
      payload.partyName = partyName.trim()
    }
    const ref = await addDoc(collection(db, LEDGER_COLLECTION), {
      ...payload,
      createdAtTs: serverTimestamp(),
    })
    
    // Log activity - always try to log, but don't fail the operation if logging fails
    try {
      await ledgerActivityService.logActivity({
        ledgerEntryId: ref.id,
        activityType: 'created',
        amount,
        note,
        date: dateValue,
        supplier,
        partyName,
        type,
      })
    } catch (error) {
      console.error('Failed to log ledger activity for creation:', error)
      // Don't throw - entry creation already succeeded
    }
    
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
        supplier: data.supplier,
        partyName: data.partyName,
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
          supplier: data.supplier,
          partyName: data.partyName,
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
    
    // Get entry before deleting to log activity
    let entry: LedgerEntry | null = null
    try {
      entry = await this.getEntryById(id)
    } catch (error) {
      console.warn('Failed to get entry before deletion for activity logging:', error)
    }
    
    await deleteDoc(doc(db, LEDGER_COLLECTION, id))
    
    // Log activity - always try to log even if entry fetch failed
    try {
      await ledgerActivityService.logActivity({
        ledgerEntryId: id,
        activityType: 'deleted',
        amount: entry?.amount,
        note: entry?.note,
        date: entry?.date,
        supplier: entry?.supplier,
        partyName: entry?.partyName,
        type: entry?.type,
      })
    } catch (error) {
      console.error('Failed to log ledger activity for deletion:', error)
      // Don't throw - deletion already succeeded
    }
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

  async getEntryById(id: string): Promise<LedgerEntry | null> {
    const db = getDb()
    if (!db) return null
    try {
      const docRef = doc(db, LEDGER_COLLECTION, id)
      const docSnap = await getDoc(docRef)
      if (!docSnap.exists()) {
        return null
      }
      const data = docSnap.data() as any
      const createdAt =
        data.createdAt ??
        (data.createdAtTs && (data.createdAtTs as Timestamp).toDate().toISOString()) ??
        undefined
      
      // Convert date field from Timestamp to ISO string if needed
      let dateValue = data.date
      if (dateValue && typeof dateValue.toDate === 'function') {
        dateValue = (dateValue as Timestamp).toDate().toISOString()
      }
      
      return {
        id: docSnap.id,
        type: data.type,
        amount: data.amount,
        note: data.note,
        date: dateValue,
        source: data.source,
        supplier: data.supplier,
        partyName: data.partyName,
        ...(createdAt ? { createdAt } : {}),
      }
    } catch (error) {
      console.error('Error getting ledger entry by ID:', error)
      return null
    }
  },

  async update(id: string, updates: { amount?: number; note?: string; date?: string; supplier?: string; partyName?: string }): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    
    // Get entry before updating to log activity
    const oldEntry = await this.getEntryById(id)
    
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

    if (updates.supplier !== undefined) {
      if (updates.supplier && updates.supplier.trim()) {
        updateData.supplier = updates.supplier.trim()
      } else {
        updateData.supplier = null // Remove supplier if empty
      }
    }

    if (updates.partyName !== undefined) {
      if (updates.partyName && updates.partyName.trim()) {
        updateData.partyName = updates.partyName.trim()
      } else {
        updateData.partyName = null // Remove partyName if empty
      }
    }
    
    await updateDoc(entryRef, updateData)
    
    // Log activity - always try to log even if oldEntry fetch failed
    try {
      await ledgerActivityService.logActivity({
        ledgerEntryId: id,
        activityType: 'updated',
        amount: updates.amount !== undefined ? updates.amount : (oldEntry?.amount),
        previousAmount: oldEntry?.amount,
        note: updates.note !== undefined ? (updates.note || undefined) : oldEntry?.note,
        previousNote: oldEntry?.note,
        date: updates.date !== undefined ? updateData.date : oldEntry?.date,
        previousDate: oldEntry?.date,
        supplier: updates.supplier !== undefined ? (updates.supplier || undefined) : oldEntry?.supplier,
        previousSupplier: oldEntry?.supplier,
        partyName: updates.partyName !== undefined ? (updates.partyName || undefined) : oldEntry?.partyName,
        previousPartyName: oldEntry?.partyName,
        type: oldEntry?.type,
      })
    } catch (error) {
      console.error('Failed to log ledger activity for update:', error)
      // Don't throw - update already succeeded
    }
  },
}


