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
} from 'firebase/firestore'
import { getDb } from './firebase'

export type LedgerType = 'credit' | 'debit'
export type LedgerSource = 'manual' | 'partyPayment' | 'invoicePayment' | 'orderExpense'

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
  async addEntry(type: LedgerType, amount: number, note?: string, source: LedgerSource = 'manual'): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    const now = new Date().toISOString()
    const payload: any = {
      type,
      amount,
      date: now,
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
    const q = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
    const snap = await getDocs(q)
    const items: LedgerEntry[] = []
    snap.forEach((d) => {
      const data = d.data() as any
      const createdAt =
        data.createdAt ??
        (data.createdAtTs && (data.createdAtTs as Timestamp).toDate().toISOString()) ??
        undefined
      items.push({
        id: d.id,
        type: data.type,
        amount: data.amount,
        note: data.note,
        date: data.date,
        source: data.source,
        ...(createdAt ? { createdAt } : {}),
      })
    })
    return items
  },

  subscribe(callback: (entries: LedgerEntry[]) => void): () => void {
    const db = getDb()
    if (!db) return () => {}
    const qRef = query(collection(db, LEDGER_COLLECTION), orderBy('date', 'desc'))
    return onSnapshot(qRef, (snap) => {
      const items: LedgerEntry[] = []
      snap.forEach((d) => {
        const data = d.data() as any
        const createdAt =
          data.createdAt ??
          (data.createdAtTs && (data.createdAtTs as Timestamp).toDate().toISOString()) ??
          undefined
        items.push({
          id: d.id,
          type: data.type,
          amount: data.amount,
          note: data.note,
          date: data.date,
          source: data.source,
          ...(createdAt ? { createdAt } : {}),
        })
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
}


