import { getDb } from './firebase'
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, onSnapshot } from 'firebase/firestore'

export type LedgerActivityType = 'created' | 'updated' | 'deleted'

export interface LedgerActivity {
  id?: string
  ledgerEntryId: string
  activityType: LedgerActivityType
  timestamp: string // ISO date string
  amount?: number
  previousAmount?: number
  note?: string
  previousNote?: string
  date?: string
  previousDate?: string
  supplier?: string
  previousSupplier?: string
  partyName?: string
  previousPartyName?: string
  type?: 'credit' | 'debit'
  previousType?: 'credit' | 'debit'
}

const LEDGER_ACTIVITIES_COLLECTION = 'ledgerActivities'

export const ledgerActivityService = {
  // Log an activity
  async logActivity(activity: Omit<LedgerActivity, 'id' | 'timestamp'>): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    
    const activityData: Omit<LedgerActivity, 'id'> = {
      ...activity,
      timestamp: new Date().toISOString(),
    }
    
    const ref = await addDoc(collection(db, LEDGER_ACTIVITIES_COLLECTION), {
      ...activityData,
      timestampTs: Timestamp.now(),
    })
    
    return ref.id
  },

  // Get all activities with optional date range filter
  async getActivities(startDate?: string, endDate?: string): Promise<LedgerActivity[]> {
    const db = getDb()
    if (!db) return []
    
    // Build query - Firestore requires orderBy on the same field as where clauses
    // So we'll fetch all and filter in memory if both dates are provided
    let q = query(collection(db, LEDGER_ACTIVITIES_COLLECTION), orderBy('timestamp', 'desc'))
    
    const snap = await getDocs(q)
    const activities: LedgerActivity[] = []
    
    snap.forEach((doc) => {
      const data = doc.data() as any
      const timestamp = data.timestamp || 
        (data.timestampTs && (data.timestampTs as Timestamp).toDate().toISOString()) ||
        new Date().toISOString()
      
      // Apply date filters in JavaScript
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        if (new Date(timestamp) < start) return
      }
      
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (new Date(timestamp) > end) return
      }
      
      activities.push({
        id: doc.id,
        ledgerEntryId: data.ledgerEntryId,
        activityType: data.activityType,
        timestamp,
        amount: data.amount,
        previousAmount: data.previousAmount,
        note: data.note,
        previousNote: data.previousNote,
        date: data.date,
        previousDate: data.previousDate,
        supplier: data.supplier,
        previousSupplier: data.previousSupplier,
        partyName: data.partyName,
        previousPartyName: data.previousPartyName,
        type: data.type,
        previousType: data.previousType,
      })
    })
    
    return activities
  },

  // Subscribe to activities with real-time updates
  subscribe(callback: (activities: LedgerActivity[]) => void, startDate?: string, endDate?: string): () => void {
    const db = getDb()
    if (!db) return () => {}
    
    const q = query(collection(db, LEDGER_ACTIVITIES_COLLECTION), orderBy('timestamp', 'desc'))
    
    return onSnapshot(q, (snap) => {
      const activities: LedgerActivity[] = []
      
      snap.forEach((doc) => {
        const data = doc.data() as any
        const timestamp = data.timestamp || 
          (data.timestampTs && (data.timestampTs as Timestamp).toDate().toISOString()) ||
          new Date().toISOString()
        
        // Apply date filters in JavaScript
        if (startDate) {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          if (new Date(timestamp) < start) return
        }
        
        if (endDate) {
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          if (new Date(timestamp) > end) return
        }
        
        activities.push({
          id: doc.id,
          ledgerEntryId: data.ledgerEntryId,
          activityType: data.activityType,
          timestamp,
          amount: data.amount,
          previousAmount: data.previousAmount,
          note: data.note,
          previousNote: data.previousNote,
          date: data.date,
          previousDate: data.previousDate,
          supplier: data.supplier,
          previousSupplier: data.previousSupplier,
          partyName: data.partyName,
          previousPartyName: data.previousPartyName,
          type: data.type,
          previousType: data.previousType,
        })
      })
      
      callback(activities)
    }, (error) => {
      console.error('Error subscribing to activities:', error)
      callback([])
    })
  },
}

