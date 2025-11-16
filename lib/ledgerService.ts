import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { getDb } from './firebase'

export type LedgerType = 'credit' | 'debit'

export interface LedgerEntry {
  id?: string
  type: LedgerType
  amount: number
  note?: string
  date: string // ISO timestamp
  createdAt?: string
}

const LEDGER_COLLECTION = 'ledgerEntries'

export const ledgerService = {
  async addEntry(type: LedgerType, amount: number, note?: string): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firebase is not configured.')
    const now = new Date().toISOString()
    const payload: Omit<LedgerEntry, 'id'> = {
      type,
      amount,
      note,
      date: now,
      createdAt: now,
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
        ...(createdAt ? { createdAt } : {}),
      })
    })
    return items
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


