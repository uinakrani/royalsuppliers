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

    async addWithdrawal(withdrawal: Withdrawal) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const docRef = await addDoc(collection(db, COLLECTION_WITHDRAWALS), {
            ...withdrawal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        return { ...withdrawal, id: docRef.id }
    },

    async updateWithdrawal(id: string, updates: Partial<Withdrawal>) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const docRef = doc(db, COLLECTION_WITHDRAWALS, id)
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        })
    },

    async deleteWithdrawal(id: string) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        await deleteDoc(doc(db, COLLECTION_WITHDRAWALS, id))
    },

    async getWithdrawals(partnerId: string) {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const q = query(
            collection(db, COLLECTION_WITHDRAWALS),
            where('partnerId', '==', partnerId)
            // Note: Sorting by date should be done in memory or requires a composite index
        )
        const snapshot = await getDocs(q)
        const withdrawals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Withdrawal))
        return withdrawals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },

    async getAllWithdrawals() {
        const db = getDb()
        if (!db) throw new Error('Firestore not initialized')
        const snapshot = await getDocs(collection(db, COLLECTION_WITHDRAWALS))
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Withdrawal))
    }
}

