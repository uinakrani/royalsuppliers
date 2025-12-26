'use client'

interface CacheMetadata {
  lastUpdated: number
  version: string
  itemCount: number
}

export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
export const CACHE_VERSION = '1.0.0'

export enum CACHE_KEYS {
  ORDERS = 'ROYAL_SUPPLIERS_ORDERS_CACHE',
  LEDGER_ENTRIES = 'ROYAL_SUPPLIERS_LEDGER_ENTRIES_CACHE',
  INVOICES = 'ROYAL_SUPPLIERS_INVOICES_CACHE',
}

class LocalStorageCache {
  private static instance: LocalStorageCache
  private metadata: Partial<Record<CACHE_KEYS, CacheMetadata>> = {}

  private constructor() {
    this.loadMetadata()
    // Clear expired entries on initialization, but with a slight delay
    // to avoid blocking the main thread immediately.
    setTimeout(() => this.clearExpiredEntries(), 1000)
  }

  public static getInstance(): LocalStorageCache {
    if (!LocalStorageCache.instance) {
      LocalStorageCache.instance = new LocalStorageCache()
    }
    return LocalStorageCache.instance
  }

  private loadMetadata() {
    try {
      if (typeof localStorage !== 'undefined') {
        const metadataString = localStorage.getItem('ROYAL_SUPPLIERS_CACHE_METADATA')
        if (metadataString) {
          this.metadata = JSON.parse(metadataString)
        }
      }
    } catch (error) {
      console.error('Failed to load cache metadata:', error)
      // Clear localStorage in case of corrupted metadata
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('ROYAL_SUPPLIERS_CACHE_METADATA')
      }
      this.metadata = {}
    }
  }

  private saveMetadata() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ROYAL_SUPPLIERS_CACHE_METADATA', JSON.stringify(this.metadata))
      }
    } catch (error) {
      console.error('Failed to save cache metadata:', error)
    }
  }

  private isExpired(cacheKey: CACHE_KEYS): boolean {
    const meta = this.metadata[cacheKey]
    if (!meta) return true
    return Date.now() - meta.lastUpdated > CACHE_EXPIRY_MS
  }

  private isVersionValid(cacheKey: CACHE_KEYS): boolean {
    const meta = this.metadata[cacheKey]
    if (!meta) return false
    return meta.version === CACHE_VERSION
  }

  public get<T>(cacheKey: CACHE_KEYS): T | null {
    if (typeof localStorage === 'undefined') {
      return null
    }

    try {
      const storedItem = localStorage.getItem(cacheKey)
      if (!storedItem) {
        return null
      }

      if (this.isExpired(cacheKey) || !this.isVersionValid(cacheKey)) {
        console.log(`Cache for ${cacheKey} is expired or version invalid. Clearing.`)
        this.clear(cacheKey)
        return null
      }

      const data = JSON.parse(storedItem) as T
      // Ensure metadata is up-to-date with current item count if available
      if (!this.metadata[cacheKey]) {
        this.metadata[cacheKey] = {
          lastUpdated: Date.now(),
          version: CACHE_VERSION,
          itemCount: Array.isArray(data) ? data.length : 1,
        }
      } else {
        this.metadata[cacheKey].itemCount = Array.isArray(data) ? data.length : 1
      }
      this.saveMetadata()
      return data
    } catch (error) {
      console.error(`Error retrieving cache for ${cacheKey}:`, error)
      this.clear(cacheKey) // Clear corrupted cache
      return null
    }
  }

  public set<T>(cacheKey: CACHE_KEYS, data: T) {
    if (typeof localStorage === 'undefined') {
      return
    }

    try {
      const dataString = JSON.stringify(data)
      localStorage.setItem(cacheKey, dataString)
      this.metadata[cacheKey] = {
        lastUpdated: Date.now(),
        version: CACHE_VERSION,
        itemCount: Array.isArray(data) ? data.length : 1,
      }
      this.saveMetadata()

      // Aggressively clear expired entries if storage is getting full
      if (typeof localStorage !== 'undefined' && localStorage.length > 50) { // Arbitrary threshold
        this.clearExpiredEntries()
      }
    } catch (error) {
      console.error(`Error setting cache for ${cacheKey}:`, error)
      // If quota exceeded, try to clear some cache and retry
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('LocalStorage QuotaExceededError. Attempting to clear expired entries.')
        this.clearExpiredEntries()
        try {
          // Retry after clearing
          localStorage.setItem(cacheKey, JSON.stringify(data))
          this.metadata[cacheKey] = {
            lastUpdated: Date.now(),
            version: CACHE_VERSION,
            itemCount: Array.isArray(data) ? data.length : 1,
          }
          this.saveMetadata()
        } catch (retryError) {
          console.error('LocalStorage QuotaExceededError on retry. Data not saved.', retryError)
        }
      }
    }
  }

  public clear(cacheKey: CACHE_KEYS) {
    if (typeof localStorage === 'undefined') {
      return
    }
    try {
      localStorage.removeItem(cacheKey)
      delete this.metadata[cacheKey]
      this.saveMetadata()
    } catch (error) {
      console.error(`Error clearing cache for ${cacheKey}:`, error)
    }
  }

  public clearAll() {
    if (typeof localStorage === 'undefined') {
      return
    }
    try {
      for (const key of Object.values(CACHE_KEYS)) {
        localStorage.removeItem(key)
      }
      localStorage.removeItem('ROYAL_SUPPLIERS_CACHE_METADATA')
      this.metadata = {}
      console.log('All localStorage cache cleared.')
    } catch (error) {
      console.error('Error clearing all cache:', error)
    }
  }

  public clearExpiredEntries() {
    if (typeof localStorage === 'undefined') {
      return
    }
    console.log('Checking for expired cache entries...')
    let clearedCount = 0
    for (const key of Object.values(CACHE_KEYS)) {
      if (this.isExpired(key) || !this.isVersionValid(key)) {
        this.clear(key)
        clearedCount++
      }
    }
    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} expired/invalid cache entries.`)
    } else {
      console.log('No expired/invalid cache entries found.')
    }
  }

  public getMetadata(): Partial<Record<CACHE_KEYS, CacheMetadata>> {
    return { ...this.metadata }
  }

  public getCacheStats(): Record<string, any> {
    if (typeof localStorage === 'undefined') {
      return { message: 'localStorage is not available' }
    }
    const stats: Record<string, any> = {
      totalEntries: Object.keys(this.metadata).length,
      localStorageUsed: `${(JSON.stringify(localStorage).length / 1024).toFixed(2)} KB`,
    }
    for (const key of Object.values(CACHE_KEYS)) {
      const meta = this.metadata[key]
      if (meta) {
        stats[key] = {
          lastUpdated: new Date(meta.lastUpdated).toISOString(),
          version: meta.version,
          itemCount: meta.itemCount,
          isExpired: this.isExpired(key),
          isVersionValid: this.isVersionValid(key),
        }
      } else {
        stats[key] = 'No entry'
      }
    }
    return stats
  }

  public forceRefresh(cacheKey: CACHE_KEYS) {
    if (typeof localStorage === 'undefined') {
      return
    }
    console.log(`Forcing refresh for ${cacheKey}...`)
    this.clear(cacheKey)
  }

  public refreshAll() {
    if (typeof localStorage === 'undefined') {
      return
    }
    console.log('Forcing refresh for all cache entries...')
    this.clearAll()
  }
}

export const localStorageCache = LocalStorageCache.getInstance()
