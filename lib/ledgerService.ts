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
import { orderService } from './orderService'
import { partyPaymentService } from './partyPaymentService'

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

    // If this is a supplier payment (debit with supplier name), distribute to unpaid orders
    if (type === 'debit' && supplier && supplier.trim()) {
      try {
        // 1. Reconcile FIRST to clean up any orphan payments from previous failures/manual deletions
        // This ensures we don't distribute if the ledger is already out of sync
        const allLedgerEntries = await this.list()
        const validLedgerIds = allLedgerEntries.map(e => e.id!).filter(Boolean)
        // Add the new ID to the valid list (since it's just added)
        validLedgerIds.push(ref.id)
        
        await orderService.reconcileSupplierOrders(supplier.trim(), validLedgerIds)

        // 2. Run distribution
        orderService.distributePaymentToSupplierOrders(
          supplier.trim(),
          amount,
          ref.id,
          note
        ).catch(err => console.error('Failed to distribute supplier payment:', err))
      } catch (e) {
        console.error('Error initiating payment distribution:', e)
      }
    }

    // Income distribution is handled manually in the ledger page for more control
    // if (type === 'credit' && partyName && partyName.trim()) {
    //   try {
    //     partyPaymentService.distributePaymentToPartyOrders(
    //       partyName.trim(),
    //       amount,
    //       ref.id,
    //       dateValue,
    //       note
    //     ).catch(err => console.error('Failed to distribute party payment:', err))
    //   } catch (e) {
    //     console.error('Error initiating party payment distribution:', e)
    //   }
    // }
    
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
    
    // Cleanup associated payments on orders (re-distribution logic)
    // This removes any payments from orders that were linked to this ledger entry
    try {
      console.log('Cleaning up payments for ledger entry:', id)
      await orderService.removePaymentsByLedgerEntryId(id)
      
      // Also trigger a full reconciliation for the supplier if available, to be safe
      if (entry?.supplier) {
        const allLedgerEntries = await this.list()
        // Filter out the ID we are about to delete
        const validLedgerIds = allLedgerEntries
          .map(e => e.id!)
          .filter(eid => eid !== id)
          .filter(Boolean)
          
        await orderService.reconcileSupplierOrders(entry.supplier, validLedgerIds)
      }

      // Trigger reconciliation for party payments if it was an income entry
      if (entry?.partyName) {
        // Get all valid ledger IDs except the one being deleted.
        const allLedgerEntries = await this.list();
        const validLedgerIds = allLedgerEntries
          .map(e => e.id!)
          .filter(eid => eid !== id)
          .filter(Boolean);
        await partyPaymentService.reconcilePartyPayments(entry.partyName, validLedgerIds);
      }
    } catch (error) {
      console.error('Failed to cleanup order payments for ledger entry:', error)
      // Don't throw, main deletion succeeded
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

  async update(id: string, updates: { amount?: number; note?: string; date?: string; supplier?: string; partyName?: string }, options: { fromOrder?: boolean } = {}): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    
    // Get entry before updating to log activity
    const oldEntry = await this.getEntryById(id)
    
    const entryRef = doc(db, LEDGER_COLLECTION, id)
    const updateData: any = {}

    // Force date to be updated to now if any change is made
    const now = new Date().toISOString()
    updateData.date = now
    
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
    
    // Note: We ignore updates.date because we force it to now as per requirements
    // "If any change happens, it should be considered as the change of the day when the change made."
    
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

    // Sync changes back to order payment if not initiated from order
    if (!options.fromOrder) {
      try {
        await orderService.updatePaymentByLedgerEntryId(id, {
          amount: updates.amount,
          date: updateData.date, // Use the new date (now)
          // Note: We don't sync note back to payment currently as payment note is often different or specific
        })
      } catch (error) {
        console.error('Failed to sync ledger update to order payment:', error)
      }
    }

    const type = oldEntry?.type
    const supplier = updateData.supplier !== undefined ? updateData.supplier : oldEntry?.supplier

    if (type === 'debit' && supplier) {
      try {
        console.log(`🔄 Triggering redistribution for updated supplier ledger entry ${id}`)
        await orderService.redistributeSupplierPayment(id, updateData.date)
      } catch (e) {
        console.error('Redistribution failed', e)
      }
    }

    // Trigger re-distribution for party payments on credit updates
    const partyName = updateData.partyName !== undefined ? updateData.partyName : oldEntry?.partyName
    if (type === 'credit' && partyName) {
      try {
        console.log(`🔄 Triggering redistribution for updated party payment ledger entry ${id}`)
        // First, reconcile to remove old payments from orders
        const allLedgerEntries = await this.list()
        const validLedgerIds = allLedgerEntries.map(e => e.id!).filter(Boolean)
        await partyPaymentService.reconcilePartyPayments(partyName, validLedgerIds)

        // Then, re-distribute all valid payments for that party
        const partyLedgerEntries = allLedgerEntries.filter(e => e.partyName === partyName && e.type === 'credit')

        for (const entry of partyLedgerEntries) {
          if (entry.id) {
            await partyPaymentService.distributePaymentToPartyOrders(
              partyName,
              entry.amount,
              entry.id,
              entry.date,
              entry.note
            )
          }
        }
      } catch (e) {
        console.error('Party payment redistribution failed', e)
      }
    }
    
    // Log activity - only if there are changes
    try {
      // Normalize values for comparison
      const oldNote = (oldEntry?.note || '').trim() || undefined
      const newNote = updates.note !== undefined ? ((updates.note || '').trim() || undefined) : oldNote
      
      const oldAmount = oldEntry?.amount
      const newAmount = updates.amount !== undefined ? updates.amount : oldAmount

      const oldDate = oldEntry?.date
      const newDate = updateData.date // Always changed to now

      const oldSupplier = (oldEntry?.supplier || '').trim() || undefined
      const newSupplier = updates.supplier !== undefined ? (updates.supplier?.trim() || undefined) : oldSupplier

      const oldPartyName = (oldEntry?.partyName || '').trim() || undefined
      const newPartyName = updates.partyName !== undefined ? (updates.partyName?.trim() || undefined) : oldPartyName

      // Check for changes
      const hasChanges = 
        oldAmount !== newAmount ||
        oldNote !== newNote ||
        oldDate !== newDate ||
        oldSupplier !== newSupplier ||
        oldPartyName !== newPartyName

      if (!hasChanges) {
        console.log('No changes detected for ledger entry update, skipping activity log.')
        return
      }
      
      const activityData = {
        ledgerEntryId: id,
        activityType: 'updated' as const,
        amount: newAmount,
        previousAmount: oldAmount,
        note: newNote,
        previousNote: oldNote,
        date: newDate,
        previousDate: oldDate,
        supplier: newSupplier,
        previousSupplier: oldSupplier,
        partyName: newPartyName,
        previousPartyName: oldPartyName,
        type: oldEntry?.type,
      }
      
      console.log('📝 Logging ledger activity for update:', {
        ledgerEntryId: id,
        activityType: 'updated',
        hasChanges
      })
      await ledgerActivityService.logActivity(activityData)
      console.log('✅ Activity logged successfully')
    } catch (error) {
      console.error('❌ Failed to log ledger activity for update:', error)
      // Don't throw - update already succeeded, but log the error for debugging
    }
  },
}
