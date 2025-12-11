import { getDb } from './firebase'
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, onSnapshot } from 'firebase/firestore'
import { getActiveWorkspaceId, matchesActiveWorkspace, WORKSPACE_DEFAULTS } from './workspaceSession'

export type LedgerActivityType = 'created' | 'updated' | 'deleted'

export interface LedgerActivity {
  id?: string
  workspaceId?: string
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
    const workspaceId = getActiveWorkspaceId()
    
    // Convert undefined values to null for Firestore compatibility
    // Firestore doesn't allow undefined, but allows null
    const cleanActivity: any = {
      ledgerEntryId: activity.ledgerEntryId,
      activityType: activity.activityType,
      timestamp: new Date().toISOString(),
      timestampTs: Timestamp.now(),
      workspaceId: workspaceId || WORKSPACE_DEFAULTS.id,
    }
    
    // Only include fields that are defined (not undefined)
    if (activity.amount !== undefined) cleanActivity.amount = activity.amount
    if (activity.previousAmount !== undefined) cleanActivity.previousAmount = activity.previousAmount
    if (activity.note !== undefined) cleanActivity.note = activity.note || null
    if (activity.previousNote !== undefined) cleanActivity.previousNote = activity.previousNote || null
    if (activity.date !== undefined) cleanActivity.date = activity.date || null
    if (activity.previousDate !== undefined) cleanActivity.previousDate = activity.previousDate || null
    if (activity.supplier !== undefined) cleanActivity.supplier = activity.supplier || null
    if (activity.previousSupplier !== undefined) cleanActivity.previousSupplier = activity.previousSupplier || null
    if (activity.partyName !== undefined) cleanActivity.partyName = activity.partyName || null
    if (activity.previousPartyName !== undefined) cleanActivity.previousPartyName = activity.previousPartyName || null
    if (activity.type !== undefined) cleanActivity.type = activity.type || null
    if (activity.previousType !== undefined) cleanActivity.previousType = activity.previousType || null
    
    const ref = await addDoc(collection(db, LEDGER_ACTIVITIES_COLLECTION), cleanActivity)
    
    return ref.id
  },

  // Get all activities with optional date range filter
  async getActivities(startDate?: string, endDate?: string): Promise<LedgerActivity[]> {
    const db = getDb()
    if (!db) return []
    const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id
    
    // Build query - Use timestampTs for ordering since that's what's stored in Firestore
    // Firestore requires orderBy on the same field as where clauses
    // So we'll fetch all and filter in memory if both dates are provided
    let q = query(collection(db, LEDGER_ACTIVITIES_COLLECTION), orderBy('timestampTs', 'desc'))
    
    const snap = await getDocs(q)
    const activities: LedgerActivity[] = []
    
    snap.forEach((doc) => {
      const data = doc.data() as any
      const workspaceId = data.workspaceId || fallbackWorkspaceId
      if (!matchesActiveWorkspace({ workspaceId })) return
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
    const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id
    
    // Use timestampTs for ordering since that's what's stored in Firestore
    const q = query(collection(db, LEDGER_ACTIVITIES_COLLECTION), orderBy('timestampTs', 'desc'))
    
    return onSnapshot(q, (snap) => {
      const activities: LedgerActivity[] = []
      
      snap.forEach((doc) => {
        const data = doc.data() as any
        const workspaceId = data.workspaceId || fallbackWorkspaceId
        if (!matchesActiveWorkspace({ workspaceId })) return
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

