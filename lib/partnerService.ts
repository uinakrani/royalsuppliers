import { getDb } from './firebase'
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    getDocs,
    orderBy,
    serverTimestamp
} from 'firebase/firestore'
import { Partner, Withdrawal } from '@/types/partner'

const COLLECTION_PARTNERS = 'partners'
const COLLECTION_WITHDRAWALS = 'withdrawals'

export const partnerService = {
    // --- Partners ---

    async addPartner(partner: Partner) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const docRef = await addDoc(collection(db, COLLECTION_PARTNERS), {
            ...partner,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        return { ...partner, id: docRef.id }
    },

    async updatePartner(id: string, updates: Partial<Partner>) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const docRef = doc(db, COLLECTION_PARTNERS, id)
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        })
    },

    async deletePartner(id: string) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        await deleteDoc(doc(db, COLLECTION_PARTNERS, id))
    },

    async getPartners(workspaceId: string) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const q = query(
            collection(db, COLLECTION_PARTNERS),
            where('workspaceId', '==', workspaceId)
        )
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Partner))
    },

    // --- Withdrawals ---

    // --- Withdrawals (Read-only from Ledger) ---

    // Note: Withdrawals are now creating as Ledger Entries with partnerId
    // Writing/Updating/Deleting is done via ledgerService

    async getWithdrawals(partnerId: string): Promise<Withdrawal[]> {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')

        // Query ledger entries that have this partnerId
        const q = query(
            collection(db, 'ledgerEntries'),
            where('partnerId', '==', partnerId),
            // We also filter by type='debit' generally, but partnerId existence implies it's related to partner
            // In our new schema, partner withdrawal is valid if partnerId exists.
        )
        const snapshot = await getDocs(q)

        // Map LedgerEntry to Withdrawal format
        const withdrawals = snapshot.docs
            .map(doc => {
                const data = doc.data()
                // Filter out voided entries
                if (data.voided) return null

                return {
                    id: doc.id,
                    partnerId: data.partnerId,
                    amount: data.amount,
                    date: data.date,
                    note: data.note || '',
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt || data.createdAt
                } as Withdrawal
            })
            .filter((w): w is Withdrawal => w !== null) // Type guard to remove nulls

        return withdrawals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },

    async getAllWithdrawals(): Promise<Withdrawal[]> {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')

        // Get all ledger entries (inefficient, but okay for now or we needs compound index)
        // ideally: where('partnerId', '!=', null) but that requires index
        // simple way: fetch all ledger entries and filter in memory since dataset is small-ish
        // OR better: query ledgerEntries

        const q = query(collection(db, 'ledgerEntries'), orderBy('date', 'desc'))
        const snapshot = await getDocs(q)

        const withdrawals = snapshot.docs
            .map(doc => {
                const data = doc.data()
                // Must have partnerId and not be voided
                if (!data.partnerId || data.voided) return null

                return {
                    id: doc.id,
                    partnerId: data.partnerId,
                    amount: data.amount,
                    date: data.date,
                    note: data.note || '',
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt || data.createdAt
                } as Withdrawal
            })
            .filter((w): w is Withdrawal => w !== null)

        return withdrawals
    }
}

