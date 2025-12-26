'use client'

export interface SyncMetadata {
  id: string
  collection: string
  lastSyncedAt?: string
  lastModifiedAt: string
  needsSync: boolean
  operation: 'create' | 'update' | 'delete'
  data: any
  localId?: string // For items created offline before getting Firebase ID
}

// Store names
export const STORES = {
  LEDGER_ENTRIES: 'ledgerEntries',
  ORDERS: 'orders',
  INVESTMENTS: 'investments',
  INVOICES: 'invoices',
  LEDGER_ACTIVITIES: 'ledgerActivities',
  SYNC_METADATA: 'syncMetadata'
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]
type StoreListener = (items: any[]) => void

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Online-only shim that keeps the API surface area but avoids IndexedDB.
class OnlineOnlyStorage {
  private static instance: OnlineOnlyStorage
  private stores: Map<StoreName, Map<string, any>> = new Map()
  private storeListeners: Record<string, Set<StoreListener>> = {}

  private constructor() {}

  static getInstance(): OnlineOnlyStorage {
    if (!OnlineOnlyStorage.instance) {
      OnlineOnlyStorage.instance = new OnlineOnlyStorage()
    }
    return OnlineOnlyStorage.instance
  }

  private getStore(storeName: StoreName): Map<string, any> {
    let store = this.stores.get(storeName)
    if (!store) {
      store = new Map<string, any>()
      this.stores.set(storeName, store)
    }
    return store
  }

  private ensureId(item: any): string {
    if (item && typeof item.id === 'string' && item.id.length > 0) {
      return item.id
    }
    const id = generateId()
    if (item && typeof item === 'object') {
      item.id = id
    }
    return id
  }

  // Create or update an item (in-memory only)
  async put(storeName: StoreName, item: any): Promise<void> {
    const id = this.ensureId(item)
    this.getStore(storeName).set(id, item)
    await this.emitStoreChange(storeName)
  }

  // Get an item by ID
  async get(storeName: StoreName, id: string): Promise<any | null> {
    return this.getStore(storeName).get(id) ?? null
  }

  // Get all items from a store
  async getAll(storeName: StoreName): Promise<any[]> {
    return Array.from(this.getStore(storeName).values())
  }

  // Delete an item
  async delete(storeName: StoreName, id: string): Promise<void> {
    this.getStore(storeName).delete(id)
    await this.emitStoreChange(storeName)
  }

  // Clear all items from a store
  async clear(storeName: StoreName): Promise<void> {
    this.getStore(storeName).clear()
    await this.emitStoreChange(storeName)
  }

  // Query with index (simple property filter in memory)
  async getByIndex(storeName: StoreName, indexName: string, value: any): Promise<any[]> {
    const items = await this.getAll(storeName)
    return items.filter(item => item && item[indexName] === value)
  }

  // Get items that need sync
  async getItemsNeedingSync(): Promise<SyncMetadata[]> {
    return this.getByIndex(STORES.SYNC_METADATA, 'needsSync', true) as Promise<SyncMetadata[]>
  }

  // Mark item as synced
  async markAsSynced(id: string, firebaseId?: string): Promise<void> {
    const store = this.getStore(STORES.SYNC_METADATA)
    const metadata = store.get(id) as SyncMetadata | undefined
    if (!metadata) return

    metadata.needsSync = false
    metadata.lastSyncedAt = new Date().toISOString()

    if (firebaseId && metadata.localId) {
      metadata.id = firebaseId
      metadata.localId = firebaseId
    }

    store.set(metadata.id, metadata)
    await this.emitStoreChange(STORES.SYNC_METADATA)
  }

  // Add item to sync queue (no persistence)
  async queueForSync(metadata: Omit<SyncMetadata, 'needsSync'>): Promise<void> {
    const syncItem: SyncMetadata = {
      ...metadata,
      id: metadata.id || generateId(),
      needsSync: true,
      lastModifiedAt: new Date().toISOString()
    }

    this.getStore(STORES.SYNC_METADATA).set(syncItem.id, syncItem)
    await this.emitStoreChange(STORES.SYNC_METADATA)
  }

  // Always prefer online Firebase paths
  isOnline(): boolean {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine
    }
    return true
  }

  onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
    if (typeof window === 'undefined') {
      // If not in a browser environment, assume online and return a no-op cleanup
      callback(true)
      return () => {}
    }

    const onlineHandler = () => callback(true)
    const offlineHandler = () => callback(false)

    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)

    // Initial status
    callback(navigator.onLine)

    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }

  // Subscribe to changes in a specific store; useful for UI updates.
  onStoreChange(storeName: StoreName, callback: StoreListener): () => void {
    if (!this.storeListeners[storeName]) {
      this.storeListeners[storeName] = new Set()
    }
    this.storeListeners[storeName]!.add(callback)

    return () => {
      this.storeListeners[storeName]?.delete(callback)
    }
  }

  // Notify subscribers that a store changed. Best-effort; failures are logged.
  private async emitStoreChange(storeName: StoreName): Promise<void> {
    const listeners = this.storeListeners[storeName]
    if (!listeners || listeners.size === 0) return

    try {
      const items = await this.getAll(storeName)
      listeners.forEach(listener => {
        try {
          listener(items)
        } catch (err) {
          console.error(`Store listener for ${storeName} threw error:`, err)
        }
      })
    } catch (error) {
      console.error(`Failed to emit store change for ${storeName}:`, error)
    }
  }
}

// Export singleton instance
export const offlineStorage = OnlineOnlyStorage.getInstance()