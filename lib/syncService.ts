'use client'

import { getDb } from './firebase'
import { offlineStorage, SyncMetadata, STORES } from './offlineStorage'
import { ledgerService } from './ledgerService'
import { orderService } from './orderService'
import { investmentService } from './investmentService'
import { invoiceService } from './invoiceService'
import { ledgerActivityService } from './ledgerActivityService'

export interface SyncStatus {
  isOnline: boolean
  lastSyncAttempt?: string
  lastSuccessfulSync?: string
  pendingItems: number
  isSyncing: boolean
  error?: string
}

class SyncService {
  private static instance: SyncService
  private isOnline: boolean = false
  private isSyncing: boolean = false
  private syncInProgress: boolean = false
  private statusCallbacks: ((status: SyncStatus) => void)[] = []
  private cleanupOnlineListener: (() => void) | null = null
  private syncInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.initialize()
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  private async initialize(): Promise<void> {
    // Check initial online status
    this.isOnline = offlineStorage.isOnline()

    // Listen for online/offline changes
    this.cleanupOnlineListener = offlineStorage.onOnlineStatusChange((isOnline) => {
      this.isOnline = isOnline
      this.notifyStatusChange()

      if (isOnline) {
        // Trigger sync when coming online
        this.sync().catch(error => {
          console.error('Auto-sync failed:', error)
        })
      }
    })

    // Start periodic sync check (every 30 seconds when online)
    this.startPeriodicSync()

    // Initial sync if online
    if (this.isOnline) {
      setTimeout(() => {
        this.sync().catch(error => {
          console.error('Initial sync failed:', error)
        })
      }, 1000) // Small delay to let app initialize
    }
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.sync().catch(error => {
          console.error('Periodic sync failed:', error)
        })
      }
    }, 30000) // 30 seconds
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  // Get current sync status
  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingItems: 0, // Will be calculated when needed
      lastSyncAttempt: localStorage.getItem('lastSyncAttempt') || undefined,
      lastSuccessfulSync: localStorage.getItem('lastSuccessfulSync') || undefined,
      error: localStorage.getItem('lastSyncError') || undefined
    }
  }

  // Subscribe to status changes
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      const index = this.statusCallbacks.indexOf(callback)
      if (index > -1) {
        this.statusCallbacks.splice(index, 1)
      }
    }
  }

  private notifyStatusChange(): void {
    const status = this.getStatus()
    this.statusCallbacks.forEach(callback => callback(status))
  }

  // Force a sync
  async sync(): Promise<void> {
    if (this.syncInProgress || this.isSyncing) {
      console.log('Sync already in progress, skipping')
      return
    }

    if (!this.isOnline) {
      console.log('Offline, skipping sync')
      return
    }

    this.syncInProgress = true
    this.isSyncing = true
    this.notifyStatusChange()

    try {
      localStorage.setItem('lastSyncAttempt', new Date().toISOString())
      localStorage.removeItem('lastSyncError')

      console.log('🔄 Starting sync process...')

      // Get items that need sync
      const pendingItems = await offlineStorage.getItemsNeedingSync()

      if (pendingItems.length === 0) {
        console.log('✅ No items need sync')
        localStorage.setItem('lastSuccessfulSync', new Date().toISOString())
        return
      }

      console.log(`📋 Found ${pendingItems.length} items to sync`)

      // Group items by collection for batch processing
      const itemsByCollection = pendingItems.reduce((acc, item) => {
        if (!acc[item.collection]) {
          acc[item.collection] = []
        }
        acc[item.collection].push(item)
        return acc
      }, {} as Record<string, SyncMetadata[]>)

      // Sync each collection
      for (const [collection, items] of Object.entries(itemsByCollection)) {
        await this.syncCollection(collection, items)
      }

      // After syncing all collections, do a full refresh from Firestore to ensure consistency
      await this.refreshFromFirestore()

      localStorage.setItem('lastSuccessfulSync', new Date().toISOString())
      console.log('✅ Sync completed successfully')

    } catch (error) {
      console.error('❌ Sync failed:', error)
      localStorage.setItem('lastSyncError', error instanceof Error ? error.message : 'Unknown sync error')
      throw error
    } finally {
      this.syncInProgress = false
      this.isSyncing = false
      this.notifyStatusChange()
    }
  }

  private async syncCollection(collection: string, items: SyncMetadata[]): Promise<void> {
    console.log(`🔄 Syncing collection: ${collection} (${items.length} items)`)

    for (const item of items) {
      try {
        await this.syncItem(collection, item)
      } catch (error) {
        console.error(`❌ Failed to sync item ${item.id} in ${collection}:`, error)
        // Continue with other items - don't fail the whole sync
      }
    }
  }

  private async syncItem(collection: string, item: SyncMetadata): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Firebase not initialized')
    }

    switch (collection) {
      case STORES.LEDGER_ENTRIES:
        await this.syncLedgerEntry(item)
        break
      case STORES.ORDERS:
        await this.syncOrder(item)
        break
      case STORES.INVESTMENTS:
        await this.syncInvestment(item)
        break
      case STORES.INVOICES:
        await this.syncInvoice(item)
        break
      case STORES.LEDGER_ACTIVITIES:
        await this.syncLedgerActivity(item)
        break
      default:
        console.warn(`Unknown collection for sync: ${collection}`)
    }
  }

  private async syncLedgerEntry(item: SyncMetadata): Promise<void> {
    const { operation, data, id } = item

    switch (operation) {
      case 'create':
        const newId = await ledgerService.addEntry(
          data.type,
          data.amount,
          data.note,
          data.source,
          data.date,
          data.supplier,
          data.partyName,
          data.partnerId,
          {
            rollbackOnFailure: false,
            useId: item.localId || id,
            skipLocalWrite: true,
            skipActivityLog: true,
            fromSync: true,
          }
        )
        // Update local item with Firebase ID
        await offlineStorage.markAsSynced(id, newId)
        break

      case 'update':
        await ledgerService.update(
          id,
          {
            amount: data.amount,
            note: data.note,
            date: data.date,
            supplier: data.supplier,
            partyName: data.partyName
          },
          { rollbackOnFailure: false }
        )
        await offlineStorage.markAsSynced(id)
        break

      case 'delete':
        await ledgerService.remove(id, { rollbackOnFailure: false })
        await offlineStorage.markAsSynced(id)
        break
    }
  }

  private async syncOrder(item: SyncMetadata): Promise<void> {
    const { operation, data, id } = item

    switch (operation) {
      case 'create':
        const newId = await orderService.createOrder(data, { skipQueue: true })
        await offlineStorage.markAsSynced(id, newId)
        break

      case 'update':
        await orderService.updateOrder(id, data, { skipQueue: true })
        await offlineStorage.markAsSynced(id)
        break

      case 'delete':
        await orderService.deleteOrder(id, { skipQueue: true })
        await offlineStorage.markAsSynced(id)
        break
    }
  }

  private async syncInvestment(item: SyncMetadata): Promise<void> {
    const { operation, data, id } = item

    switch (operation) {
      case 'create':
      case 'update':
        await investmentService.setInvestment(data.amount, data.date, data.note)
        await offlineStorage.markAsSynced(id)
        break
    }
  }

  private async syncInvoice(item: SyncMetadata): Promise<void> {
    const { operation, data, id } = item

    switch (operation) {
      case 'create':
        const newId = await invoiceService.createInvoice(data, { skipQueue: true })
        await offlineStorage.markAsSynced(id, newId)
        break

      case 'update':
        await invoiceService.updateInvoice(id, data, { skipQueue: true })
        await offlineStorage.markAsSynced(id)
        break

      case 'delete':
        await invoiceService.deleteInvoice(id, { skipQueue: true })
        await offlineStorage.markAsSynced(id)
        break
    }
  }

  private async syncLedgerActivity(item: SyncMetadata): Promise<void> {
    const { operation, data, id } = item

    if (operation === 'create') {
      await ledgerActivityService.logActivity(data)
      await offlineStorage.markAsSynced(id)
    }
  }

  // Refresh local data from Firestore after sync
  private async refreshFromFirestore(): Promise<void> {
    console.log('🔄 Refreshing local data from Firestore...')

    try {
      // Refresh ledger entries
      const ledgerItems = await ledgerService.list()
      for (const item of ledgerItems) {
        await offlineStorage.put(STORES.LEDGER_ENTRIES, item)
      }

      // Refresh orders
      const orders = await orderService.fetchOrdersFromFirestore().catch(() => [])
      for (const order of orders) {
        await offlineStorage.put(STORES.ORDERS, order)
      }

      // Refresh investments
      const investment = await investmentService.getInvestment()
      if (investment) {
        await offlineStorage.put(STORES.INVESTMENTS, investment)
      }

      // Refresh investment history
      const investmentHistory = await investmentService.getActivityLog()
      for (const activity of investmentHistory) {
        await offlineStorage.put(STORES.LEDGER_ACTIVITIES, { ...activity, id: `investment-${activity.id}` })
      }

      // Refresh invoices
      const invoices = await invoiceService.getAllInvoices()
      for (const invoice of invoices) {
        await offlineStorage.put(STORES.INVOICES, invoice)
      }

      console.log('✅ Local data refreshed from Firestore')
    } catch (error) {
      console.error('❌ Failed to refresh local data:', error)
      // Don't throw - sync might still be partially successful
    }
  }

  // Cleanup
  destroy(): void {
    if (this.cleanupOnlineListener) {
      this.cleanupOnlineListener()
    }
    this.stopPeriodicSync()
    this.statusCallbacks = []
  }
}

// Export singleton instance
export const syncService = SyncService.getInstance()




