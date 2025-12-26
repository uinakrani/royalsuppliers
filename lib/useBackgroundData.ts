'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { localStorageCache, CACHE_KEYS } from './localStorageCache'
import { orderService } from './orderService'
import { ledgerService } from './ledgerService'
import { invoiceService } from './invoiceService'
import { Order, OrderFilters } from '@/types/order'
import { LedgerEntry } from '@/lib/ledgerService'
import { Invoice, InvoiceFilters } from '@/types/invoice'

/**
 * React hook for background data fetching with localStorage caching
 * Loads data from cache immediately, then fetches fresh data in background
 */
export function useOrders(
  filters?: OrderFilters,
  options?: {
    enabled?: boolean
    refreshInterval?: number // in milliseconds
    skipCache?: boolean
  }
) {
  const { enabled = true, refreshInterval, skipCache = false } = options || {}
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadOrders = useCallback(async (isBackground = false) => {
    if (!enabled) return

    try {
      if (!isBackground) {
        setLoading(true)
        setError(null)
      }

      const freshOrders = await orderService.getAllOrders(filters, {
        skipCache,
        onRemoteUpdate: (updatedOrders) => {
          setOrders(updatedOrders)
          if (!isBackground) setLoading(false)
        }
      })

      setOrders(freshOrders)
      if (!isBackground) setLoading(false)
    } catch (err) {
      const error = err as Error
      setError(error)
      setLoading(false)
      console.error('Error loading orders:', error)
    }
  }, [enabled, filters, skipCache])

  // Load data on mount and when filters change
  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Set up periodic refresh if requested
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        loadOrders(true) // background refresh
      }, refreshInterval)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [refreshInterval, loadOrders])

  // Manual refresh function
  const refresh = useCallback(() => {
    // Force refresh by clearing cache and reloading
    localStorageCache.forceRefresh(CACHE_KEYS.ORDERS)
    loadOrders()
  }, [loadOrders])

  return {
    orders,
    loading,
    error,
    refresh
  }
}

/**
 * React hook for background ledger data fetching
 */
export function useLedgerEntries(options?: {
  enabled?: boolean
  refreshInterval?: number
  skipCache?: boolean
}) {
  const { enabled = true, refreshInterval, skipCache = false } = options || {}
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadEntries = useCallback(async (isBackground = false) => {
    if (!enabled) return

    try {
      if (!isBackground) {
        setLoading(true)
        setError(null)
      }

      const freshEntries = await ledgerService.list({
        skipCache,
        onRemoteUpdate: (updatedEntries) => {
          setEntries(updatedEntries)
          if (!isBackground) setLoading(false)
        }
      })

      setEntries(freshEntries)
      if (!isBackground) setLoading(false)
    } catch (err) {
      const error = err as Error
      setError(error)
      setLoading(false)
      console.error('Error loading ledger entries:', error)
    }
  }, [enabled, skipCache])

  // Load data on mount
  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Set up periodic refresh if requested
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        loadEntries(true) // background refresh
      }, refreshInterval)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [refreshInterval, loadEntries])

  // Manual refresh function
  const refresh = useCallback(() => {
    // Force refresh by clearing cache and reloading
    localStorageCache.forceRefresh(CACHE_KEYS.LEDGER_ENTRIES)
    loadEntries()
  }, [loadEntries])

  return {
    entries,
    loading,
    error,
    refresh
  }
}

/**
 * React hook for background invoice data fetching
 */
export function useInvoices(
  filters?: InvoiceFilters,
  options?: {
    enabled?: boolean
    refreshInterval?: number
    skipCache?: boolean
  }
) {
  const { enabled = true, refreshInterval, skipCache = false } = options || {}
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadInvoices = useCallback(async (isBackground = false) => {
    if (!enabled) return

    try {
      if (!isBackground) {
        setLoading(true)
        setError(null)
      }

      const freshInvoices = await invoiceService.getAllInvoices(filters, {
        skipCache,
        onRemoteUpdate: (updatedInvoices) => {
          setInvoices(updatedInvoices)
          if (!isBackground) setLoading(false)
        }
      })

      setInvoices(freshInvoices)
      if (!isBackground) setLoading(false)
    } catch (err) {
      const error = err as Error
      setError(error)
      setLoading(false)
      console.error('Error loading invoices:', error)
    }
  }, [enabled, filters, skipCache])

  // Load data on mount and when filters change
  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // Set up periodic refresh if requested
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        loadInvoices(true) // background refresh
      }, refreshInterval)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [refreshInterval, loadInvoices])

  // Manual refresh function
  const refresh = useCallback(() => {
    // Force refresh by clearing cache and reloading
    localStorageCache.forceRefresh(CACHE_KEYS.INVOICES)
    loadInvoices()
  }, [loadInvoices])

  return {
    invoices,
    loading,
    error,
    refresh
  }
}
