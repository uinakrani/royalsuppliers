import { getDb } from './firebase'
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore'

export interface InvestmentRecord {
    id?: string
    amount: number
    date: string
    note?: string
    createdAt?: string
    updatedAt?: string
}

export interface InvestmentActivity {
    id?: string
    timestamp: string
    activityType: 'created' | 'updated'
    amount: number
    previousAmount?: number
    date: string
    previousDate?: string
    note?: string
    previousNote?: string
}

class InvestmentService {
    private collectionName = 'investment'
    private activityCollectionName = 'investmentActivity'

    async getInvestment(): Promise<InvestmentRecord | null> {
        try {
            const db = getDb()
            if (!db) throw new Error('Database not initialized')

            const investmentSnapshot = await getDocs(collection(db, this.collectionName))

            if (investmentSnapshot.empty) {
                return null
            }

            // Should only be one investment record
            const doc = investmentSnapshot.docs[0]
            return {
                id: doc.id,
                ...doc.data()
            } as InvestmentRecord
        } catch (error) {
            console.error('Error getting investment:', error)
            throw error
        }
    }

    async setInvestment(amount: number, date: string, note?: string): Promise<string> {
        try {
            const db = getDb()
            if (!db) throw new Error('Database not initialized')

            const existingInvestment = await this.getInvestment()

            const now = new Date().toISOString()

            if (existingInvestment && existingInvestment.id) {
                // Update existing
                const previousAmount = existingInvestment.amount
                const previousDate = existingInvestment.date
                const previousNote = existingInvestment.note || ''

                // Check for changes
                const hasChanges = 
                    previousAmount !== amount ||
                    previousDate !== date ||
                    previousNote.trim() !== (note || '').trim()

                if (!hasChanges) {
                    console.log('No changes detected for investment update, skipping.')
                    return existingInvestment.id
                }

                await updateDoc(doc(db, this.collectionName, existingInvestment.id), {
                    amount,
                    date,
                    note: note || '',
                    updatedAt: now,
                })

                // Log activity
                await this.logActivity({
                    activityType: 'updated',
                    amount,
                    previousAmount,
                    date,
                    previousDate,
                    note,
                    previousNote,
                    timestamp: now,
                })

                return existingInvestment.id
            } else {
                // Create new
                const docRef = await addDoc(collection(db, this.collectionName), {
                    amount,
                    date,
                    note: note || '',
                    createdAt: now,
                    updatedAt: now,
                })

                // Log activity
                await this.logActivity({
                    activityType: 'created',
                    amount,
                    date,
                    note,
                    timestamp: now,
                })

                return docRef.id
            }
        } catch (error) {
            console.error('Error setting investment:', error)
            throw error
        }
    }

    async getActivityLog(): Promise<InvestmentActivity[]> {
        try {
            const db = getDb()
            if (!db) return []

            const q = query(
                collection(db, this.activityCollectionName),
                orderBy('timestamp', 'desc')
            )
            const snapshot = await getDocs(q)

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as InvestmentActivity[]
        } catch (error) {
            console.error('Error getting investment activity log:', error)
            return []
        }
    }

    private async logActivity(activity: Omit<InvestmentActivity, 'id'>): Promise<void> {
        try {
            const db = getDb()
            if (!db) return

            await addDoc(collection(db, this.activityCollectionName), activity)
        } catch (error) {
            console.error('Error logging investment activity:', error)
            // Don't throw - activity logging shouldn't break the main operation
        }
    }
}

export const investmentService = new InvestmentService()
