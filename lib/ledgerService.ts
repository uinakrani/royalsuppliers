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
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { ledgerActivityService } from './ledgerActivityService'
import { offlineStorage, STORES } from './offlineStorage'
import { localStorageCache, CACHE_KEYS } from './localStorageCache'
import { getActiveWorkspaceId, matchesActiveWorkspace, WORKSPACE_DEFAULTS } from './workspaceSession'

export type LedgerType = 'credit' | 'debit'
export type LedgerSource = 'manual' | 'partyPayment' | 'invoicePayment' | 'orderExpense' | 'orderProfit' | 'orderPaymentUpdate'

export interface LedgerEntry {
  id?: string
  workspaceId?: string
  type: LedgerType
  amount: number
  note?: string
  date: string // ISO timestamp
  createdAt?: string
  source?: LedgerSource
  supplier?: string // For expense entries - supplier of raw materials
  partyName?: string // For income entries - party from which payment received
  voided?: boolean // Soft-deleted/archived entries stay in timeline but are ignored in totals
  voidedAt?: string // When the entry was voided
  voidReason?: string // Context for voiding (e.g., "updated", "deleted")
  replacedById?: string // New entry that supersedes this one (for updates)
}

const LEDGER_COLLECTION = 'ledgerEntries'

type AddEntryOptions = {
  rollbackOnFailure?: boolean
  useId?: string
  skipLocalWrite?: boolean
  skipActivityLog?: boolean
  fromSync?: boolean
  createdAtOverride?: string
}

// Lazy load orderService to avoid circular dependencies
let orderServicePromise: Promise<any> | null = null
const getOrderService = async () => {
  if (!orderServicePromise) {
    orderServicePromise = import('./orderService').then(module => module.orderService)
  }
  return orderServicePromise
}

// Lazy load partyPaymentService to avoid circular dependencies
let partyPaymentServicePromise: Promise<any> | null = null
const getPartyPaymentService = async () => {
  if (!partyPaymentServicePromise) {
    partyPaymentServicePromise = import('./partyPaymentService').then(module => module.partyPaymentService)
  }
  return partyPaymentServicePromise
}

// Helper method to sort ledger entries (newest date first)
function sortLedgerEntries(items: LedgerEntry[]): LedgerEntry[] {
  const getTime = (entry: LedgerEntry) => {
    // Prefer the entry date chosen by the user; fall back to createdAt
    const dateTime = entry.date ? new Date(entry.date).getTime() : NaN
    const createdTime = entry.createdAt ? new Date(entry.createdAt).getTime() : NaN

    if (!isNaN(dateTime)) return dateTime
    if (!isNaN(createdTime)) return createdTime
    return 0
  }

  return items.sort((a, b) => getTime(b) - getTime(a))
}

export const ledgerService = {
  async addEntry(
    type: LedgerType,
    amount: number,
    note?: string,
    source: LedgerSource = 'manual',
    date?: string,
    supplier?: string,
    partyName?: string,
    options: AddEntryOptions = {}
  ): Promise<string> {
    const rollbackOnFailure = options.rollbackOnFailure ?? true
    const shouldPersistLocally = !options.skipLocalWrite
    const now = new Date().toISOString()
    const createdAtValue = options.createdAtOverride || now
    const workspaceId = getActiveWorkspaceId()
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

    // Generate a temporary local ID
    const localId = options.useId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const payload: any = {
      id: localId,
      type,
      amount,
      date: dateValue,
      createdAt: createdAtValue,
      source,
      voided: false,
      workspaceId,
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

    let firebaseId: string | undefined
    const canWriteRemote = offlineStorage.isOnline()

    if (canWriteRemote) {
      try {
        const db = getDb()
        if (db) {
          if (options.useId) {
            await setDoc(doc(db, LEDGER_COLLECTION, options.useId), {
              ...payload,
              createdAtTs: serverTimestamp(),
            })
            firebaseId = options.useId
            payload.id = firebaseId
            if (shouldPersistLocally) {
              await offlineStorage.put(STORES.LEDGER_ENTRIES, payload)
              // Also update localStorage cache
              const cachedEntries = localStorageCache.get<LedgerEntry[]>(CACHE_KEYS.LEDGER_ENTRIES) || []
              const updatedCache = cachedEntries.filter(e => e.id !== payload.id).concat(payload)
              localStorageCache.set(CACHE_KEYS.LEDGER_ENTRIES, updatedCache)
            }
          } else {
            const ref = await addDoc(collection(db, LEDGER_COLLECTION), {
              ...payload,
              createdAtTs: serverTimestamp(),
            })
            firebaseId = ref.id

            // Update local cache with authoritative id
            payload.id = firebaseId
            if (shouldPersistLocally) {
              await offlineStorage.put(STORES.LEDGER_ENTRIES, payload)
              const idToDrop = options.useId || localId
              if (idToDrop && idToDrop !== firebaseId) {
                await offlineStorage.delete(STORES.LEDGER_ENTRIES, idToDrop).catch(() => {})
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync new ledger entry to Firebase, caching for later:', error)
      }
    }

    if (!firebaseId) {
      // Cache locally and queue for sync when remote write is unavailable
      if (shouldPersistLocally) {
        await offlineStorage.put(STORES.LEDGER_ENTRIES, payload)
      }

      await offlineStorage.queueForSync({
        id: localId,
        collection: STORES.LEDGER_ENTRIES,
        operation: 'create',
        data: payload,
        localId,
        lastModifiedAt: new Date().toISOString()
      })
    }

    const finalId = firebaseId || localId

    // NOTE: Automatic distribution to supplier orders is disabled per user request
    // Previously: If this is a supplier payment (debit with supplier name), distribute to unpaid orders
    // if (type === 'debit' && supplier && supplier.trim()) {
    //   try {
    //     // 1. Reconcile FIRST to clean up any orphan payments from previous failures/manual deletions
    //     // This ensures we don't distribute if the ledger is already out of sync
    //     const allLedgerEntries = await this.list()
    //     const validLedgerIds = allLedgerEntries.map(e => e.id!).filter(Boolean)
    //     // Add the new ID to the valid list (since it's just added)
    //     validLedgerIds.push(finalId)
    //
    //     const orderSvc = await getOrderService()
    //     await orderSvc.reconcileSupplierOrders(supplier.trim(), validLedgerIds)
    //
    //     // 2. Run distribution
    //     orderSvc.distributePaymentToSupplierOrders(
    //       supplier.trim(),
    //       amount,
    //       finalId,
    //       note
    //     ).catch((err: any) => console.error('Failed to distribute supplier payment:', err))
    //   } catch (e) {
    //     console.error('Error initiating payment distribution:', e)
    //   }
    // }

    // If this is an income payment (credit with party name), keep partyPayments in sync
    // but **skip** automatic distribution to orders (disabled per requirement).
    if (type === 'credit' && partyName && partyName.trim()) {
      if (source !== 'partyPayment') {
        try {
          const partySvc = await getPartyPaymentService()
          await partySvc.upsertPaymentFromLedgerCredit({
            id: finalId,
            partyName: partyName.trim(),
            amount,
            date: dateValue,
            note,
            createdAt: payload.createdAt,
          })
        } catch (e) {
          console.error('❌ Failed to upsert party payment for ledger credit:', e)
        }
      }
    }

    // Log activity - always try to log, but allow skipping when replaying sync queue
    if (!options.skipActivityLog) {
      try {
        await ledgerActivityService.logActivity({
          ledgerEntryId: finalId,
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
    }

    return finalId
  },

  async list(options?: { onRemoteUpdate?: (entries: LedgerEntry[]) => void, preferRemote?: boolean, skipCache?: boolean }): Promise<LedgerEntry[]> {
    try {
      const activeWorkspaceId = getActiveWorkspaceId()
      const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id

      // Get cached entries immediately if available and not skipping cache
      let cachedEntries: LedgerEntry[] | null = null
      if (!options?.skipCache) {
        cachedEntries = localStorageCache.get<LedgerEntry[]>(CACHE_KEYS.LEDGER_ENTRIES)
      }

      let entriesToProcess: LedgerEntry[]

      if (cachedEntries && cachedEntries.length > 0) {
        // Use cached data immediately
        entriesToProcess = cachedEntries.filter(matchesActiveWorkspace)
        options?.onRemoteUpdate?.(sortLedgerEntries(entriesToProcess))
      } else {
        // No cache available, get from offline storage as fallback
        const localItemsRaw = await offlineStorage.getAll(STORES.LEDGER_ENTRIES)
        entriesToProcess = localItemsRaw
          .map((entry) => (entry.workspaceId ? entry : { ...(entry as LedgerEntry), workspaceId: fallbackWorkspaceId }))
          .filter(matchesActiveWorkspace)
      }

      // Return cached/local data immediately
      const sortedEntries = sortLedgerEntries(entriesToProcess)

      // Fetch fresh data in background if online
      if (offlineStorage.isOnline()) {
        const db = getDb()
        if (db) {
          this.getAllFromFirestore()
            .then(async (firestoreItems) => {
              // Cache the fresh data
              localStorageCache.set(CACHE_KEYS.LEDGER_ENTRIES, firestoreItems)
              // Notify about remote update
              options?.onRemoteUpdate?.(firestoreItems)
            })
            .catch((error) => {
              console.warn('Background fetch failed for ledger entries:', error)
            })
        }
      }

      return sortedEntries

    } catch (error) {
      console.error('Error in ledgerService.list():', error)
      return []
    }
  },

  // Helper to fetch all ledger entries directly from Firestore (used for background refresh)
  async getAllFromFirestore(): Promise<LedgerEntry[]> {
    const db = getDb()
    if (!db) return []

    const q = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
    const snap = await getDocs(q)
    const firestoreItems: LedgerEntry[] = []

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

      const item = {
        id: d.id,
        type: data.type,
        amount: data.amount,
        note: data.note,
        date: dateValue,
        source: data.source,
        supplier: data.supplier,
        partyName: data.partyName,
        voided: data.voided || false,
        voidedAt: data.voidedAt,
        voidReason: data.voidReason,
        replacedById: data.replacedById,
        ...(createdAt ? { createdAt } : {}),
      }

              firestoreItems.push(item)
              // Cache in local storage
              offlineStorage.put(STORES.LEDGER_ENTRIES, item)
              // Also cache in localStorage for faster access
              const cachedEntries = localStorageCache.get<LedgerEntry[]>(CACHE_KEYS.LEDGER_ENTRIES) || []
              const updatedCache = cachedEntries.filter(e => e.id !== item.id).concat(item)
              localStorageCache.set(CACHE_KEYS.LEDGER_ENTRIES, updatedCache)
    })

    return firestoreItems
  },

  // Background sync method that doesn't block UI
  async syncWithFirestore(): Promise<void> {
    if (!offlineStorage.isOnline()) return

    const db = getDb()
    if (!db) return

    try {
      const q = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
      const snap = await getDocs(q)

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

        const item = {
          id: d.id,
          type: data.type,
          amount: data.amount,
          note: data.note,
          date: dateValue,
          source: data.source,
          supplier: data.supplier,
          partyName: data.partyName,
          voided: data.voided || false,
          voidedAt: data.voidedAt,
          voidReason: data.voidReason,
          replacedById: data.replacedById,
          ...(createdAt ? { createdAt } : {}),
        }

        // Update local storage with fresh data (async, doesn't block)
        offlineStorage.put(STORES.LEDGER_ENTRIES, item)
      })

      console.log('Background sync completed for ledger entries')
    } catch (error) {
      console.error('Background sync failed:', error)
    }
  },

  subscribe(callback: (entries: LedgerEntry[]) => void): () => void {
    let isInitialLoad = true

    // Get local data immediately for instant loading
    offlineStorage.getAll(STORES.LEDGER_ENTRIES).then(localItems => {
      if (localItems.length > 0) {
        callback(sortLedgerEntries(localItems))
      } else if (isInitialLoad) {
        // No local data - try to fetch from Firestore once if online
        if (offlineStorage.isOnline()) {
          this.list().then(callback).catch(error => {
            console.error('Error in initial ledger subscription load:', error)
            callback([])
          })
        } else {
          callback([])
        }
      }
      isInitialLoad = false
    }).catch(error => {
      console.error('Error loading local ledger data:', error)
      callback([])
      isInitialLoad = false
    })

    // Listen for local store changes to push real-time updates to UI immediately
    const offlineUnsubscribe = offlineStorage.onStoreChange(STORES.LEDGER_ENTRIES, (items) => {
      callback(sortLedgerEntries(items as LedgerEntry[]))
    })

    // Set up Firestore real-time listener for background updates
    let firestoreUnsubscribe: (() => void) | null = null

    const setupFirestoreListener = () => {
      if (!offlineStorage.isOnline()) return

      const db = getDb()
      if (!db) return

      const qRef = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
      firestoreUnsubscribe = onSnapshot(qRef, (snap) => {
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

          const item = {
            id: d.id,
            type: data.type,
            amount: data.amount,
            note: data.note,
            date: dateValue,
            source: data.source,
            supplier: data.supplier,
            partyName: data.partyName,
            voided: data.voided || false,
            voidedAt: data.voidedAt,
            voidReason: data.voidReason,
            replacedById: data.replacedById,
            ...(createdAt ? { createdAt } : {}),
          }

          items.push(item)
          // Update local storage in background
          offlineStorage.put(STORES.LEDGER_ENTRIES, item)
        })

        // Only update UI if we have data (avoid empty updates during initial sync)
        if (items.length > 0) {
          const sortedItems = sortLedgerEntries(items)
          callback(sortedItems)
        }
      }, (error) => {
        console.error('Firestore subscription error:', error)
        // Don't update UI on error - keep local data
      })
    }

    // Listen for online/offline changes
    const onlineStatusUnsubscribe = offlineStorage.onOnlineStatusChange((isOnline) => {
      if (isOnline) {
        // Setup Firestore listener when coming online
        setupFirestoreListener()
      } else {
        // Clean up Firestore listener when going offline
        if (firestoreUnsubscribe) {
          firestoreUnsubscribe()
          firestoreUnsubscribe = null
        }
      }
    })

    // Setup initial listener if online
    if (offlineStorage.isOnline()) {
      setupFirestoreListener()
    }

    // Return cleanup function
    return () => {
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe()
      }
      onlineStatusUnsubscribe()
      offlineUnsubscribe()
    }
  },

  async getBalance(): Promise<number> {
    const entries = await this.list()
    return entries
      .filter(e => !e.voided)
      .reduce((acc, e) => acc + (e.type === 'credit' ? e.amount : -e.amount), 0)
  },

  async remove(id: string, options: { rollbackOnFailure?: boolean } = {}): Promise<void> {
    const rollbackOnFailure = options.rollbackOnFailure ?? true
    const entry = await this.getEntryById(id)
    if (!entry) {
      throw new Error('Ledger entry not found')
    }

    const now = new Date().toISOString()
    const voidedEntry: LedgerEntry = {
      ...entry,
      voided: true,
      voidedAt: now,
      voidReason: 'deleted',
    }

    if (offlineStorage.isOnline()) {
      try {
        const db = getDb()
        if (db) {
          await updateDoc(doc(db, LEDGER_COLLECTION, id), {
            voided: true,
            voidedAt: now,
            voidReason: 'deleted',
          })
        }
      } catch (error) {
        console.error('Failed to sync deletion to Firebase (soft delete):', error)
        if (rollbackOnFailure) {
          throw error
        }
      }
    } else {
      await offlineStorage.queueForSync({
        id,
        collection: STORES.LEDGER_ENTRIES,
        operation: 'update',
        data: voidedEntry,
        lastModifiedAt: now
      })
    }

    // Keep the entry locally but mark it as voided
    await offlineStorage.put(STORES.LEDGER_ENTRIES, voidedEntry)

    // Cleanup associated order payments for any orderExpense ledger entry (including supplier-tagged)
    if (entry?.source === 'orderExpense') {
      try {
        console.log('Cleaning up order payments for ledger entry:', id)
        const orderSvc = await getOrderService()
        await orderSvc.removePaymentsByLedgerEntryId(id)
      } catch (error) {
        console.error('Failed to cleanup order payments for ledger entry:', error)
        // Don't throw, main deletion succeeded
      }
    }

    // Log activity - always try to log even if entry fetch failed
    try {
      await ledgerActivityService.logActivity({
        ledgerEntryId: id,
        activityType: 'deleted',
        amount: entry?.amount,
        note: entry?.note,
        date: now, // log deletion on the day it happened
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
    const entries = (await this.list()).filter(e => !e.voided)
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
    try {
      // Prefer remote when online
      if (offlineStorage.isOnline()) {
        const db = getDb()
        if (db) {
          try {
            const docRef = doc(db, LEDGER_COLLECTION, id)
            const docSnap = await getDoc(docRef)
            if (docSnap.exists()) {
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

              const item = {
                id: docSnap.id,
                workspaceId: data.workspaceId ?? WORKSPACE_DEFAULTS.id,
                type: data.type,
                amount: data.amount,
                note: data.note,
                date: dateValue,
                source: data.source,
                supplier: data.supplier,
                partyName: data.partyName,
                voided: data.voided || false,
                voidedAt: data.voidedAt,
                voidReason: data.voidReason,
                replacedById: data.replacedById,
                ...(createdAt ? { createdAt } : {}),
              }

              // Cache in local storage
              await offlineStorage.put(STORES.LEDGER_ENTRIES, item)
              return item
            }
          } catch (error) {
            console.error('Error getting ledger entry from Firestore:', error)
          }
        }
      }

      // Fallback to cache when offline
      const localItem = await offlineStorage.get(STORES.LEDGER_ENTRIES, id)
      if (localItem) {
        return localItem as LedgerEntry
      }

      return null
    } catch (error) {
      console.error('Error getting ledger entry by ID:', error)
      return null
    }
  },

  async update(
    id: string,
    updates: { amount?: number; note?: string; date?: string; supplier?: string; partyName?: string },
    options: { fromOrder?: boolean; rollbackOnFailure?: boolean } = {}
  ): Promise<string> {
    const rollbackOnFailure = options.rollbackOnFailure ?? true
    const oldEntry = await this.getEntryById(id)
    if (!oldEntry) {
      throw new Error('Ledger entry not found')
    }

    // Respect provided date; fall back to existing date or today
    const now = new Date().toISOString()
    let newDate = updates.date ?? oldEntry.date ?? now
    if (newDate && !newDate.includes('T')) {
      newDate = new Date(newDate + 'T00:00:00').toISOString()
    }

    const newAmount = updates.amount !== undefined ? updates.amount : oldEntry.amount
    const newNote = updates.note !== undefined ? (updates.note?.trim() || undefined) : oldEntry.note
    const newSupplier = updates.supplier !== undefined ? (updates.supplier?.trim() || undefined) : oldEntry.supplier
    const newPartyName = updates.partyName !== undefined ? (updates.partyName?.trim() || undefined) : oldEntry.partyName

    // Step 1: create a brand-new entry for the updated values (append-only)
    const newEntryId = await this.addEntry(
      oldEntry.type,
      newAmount,
      newNote,
      oldEntry.source || 'manual',
      newDate,
      newSupplier || undefined,
      newPartyName || undefined,
      { rollbackOnFailure, skipActivityLog: true }
    )

    // Step 2: soft-void the original entry so it remains visible but is excluded from calculations
    const voidedEntry: LedgerEntry = {
      ...oldEntry,
      voided: true,
      voidedAt: now,
      voidReason: 'updated',
      replacedById: newEntryId,
    }

    const canUpdateRemote = offlineStorage.isOnline()
    if (canUpdateRemote) {
      try {
        const db = getDb()
        if (db) {
          const entryRef = doc(db, LEDGER_COLLECTION, id)
          await updateDoc(entryRef, {
            voided: true,
            voidedAt: now,
            voidReason: 'updated',
            replacedById: newEntryId,
          })
        }
      } catch (error) {
        console.error('Failed to mark ledger entry as voided in Firebase:', error)
        if (rollbackOnFailure) {
          throw error
        }
      }
    } else {
      await offlineStorage.queueForSync({
        id,
        collection: STORES.LEDGER_ENTRIES,
        operation: 'update',
        data: voidedEntry,
        lastModifiedAt: now
      })
    }

    // Update local cache with voided metadata
    await offlineStorage.put(STORES.LEDGER_ENTRIES, voidedEntry)

    // Sync linked carting payments (order-level expenses without supplier/party) when update originates from ledger
    if (!options.fromOrder && oldEntry.id && oldEntry.source === 'orderExpense' && !oldEntry.supplier && !oldEntry.partyName) {
      try {
        const orderSvc = await getOrderService()
        await orderSvc.updatePaymentByLedgerEntryId(oldEntry.id, {
          amount: newAmount,
          date: newDate,
          note: newNote,
          newLedgerEntryId: newEntryId,
        })
      } catch (error) {
        console.error('Failed to sync carting payment update to orders:', error)
        // Don't throw - ledger update already succeeded
      }
    }

    // Step 3: log activity capturing before/after
    try {
      await ledgerActivityService.logActivity({
        ledgerEntryId: id,
        activityType: 'updated',
        amount: newAmount,
        previousAmount: oldEntry.amount,
        note: newNote,
        previousNote: oldEntry.note,
        date: newDate,
        previousDate: oldEntry.date,
        supplier: newSupplier,
        previousSupplier: oldEntry.supplier,
        partyName: newPartyName,
        previousPartyName: oldEntry.partyName,
        type: oldEntry.type,
      })
    } catch (error) {
      console.error('Failed to log ledger activity for update:', error)
      // Don't throw - update already succeeded
    }

    return newEntryId
  },
}