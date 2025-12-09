import { getDb } from './firebase'
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore'
import { offlineStorage, STORES } from './offlineStorage'

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
            if (offlineStorage.isOnline()) {
                const db = getDb()
                if (db) {
                    try {
                        const investmentSnapshot = await getDocs(collection(db, this.collectionName))

                        if (!investmentSnapshot.empty) {
                            const doc = investmentSnapshot.docs[0]
                            const investment = {
                                id: doc.id,
                                ...doc.data()
                            } as InvestmentRecord

                            await offlineStorage.put(STORES.INVESTMENTS, investment)
                            return investment
                        }
                    } catch (error) {
                        console.error('Error fetching investment from Firestore:', error)
                    }
                }
            }

            // Fallback to cached value when offline or remote fails
            const localInvestments = await offlineStorage.getAll(STORES.INVESTMENTS)
            if (localInvestments.length > 0) {
                return localInvestments[0] as InvestmentRecord
            }

            return null
        } catch (error) {
            console.error('Error getting investment:', error)
            return null
        }
    }

    // Background sync method for investment
    private async syncInvestmentWithFirestore(): Promise<void> {
        if (!offlineStorage.isOnline()) return

        const db = getDb()
        if (!db) return

        try {
            const investmentSnapshot = await getDocs(collection(db, this.collectionName))

            if (!investmentSnapshot.empty) {
                const doc = investmentSnapshot.docs[0]
                const investment = {
                    id: doc.id,
                    ...doc.data()
                } as InvestmentRecord

                // Update local storage
                await offlineStorage.put(STORES.INVESTMENTS, investment)
            }
        } catch (error) {
            console.error('Background sync failed for investment:', error)
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
            if (offlineStorage.isOnline()) {
                const db = getDb()
                if (db) {
                    try {
                        const q = query(
                            collection(db, this.activityCollectionName),
                            orderBy('timestamp', 'desc')
                        )
                        const snapshot = await getDocs(q)

                        const activities = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        })) as InvestmentActivity[]

                        for (const activity of activities) {
                            await offlineStorage.put(STORES.LEDGER_ACTIVITIES, { ...activity, id: `investment-${activity.id}` })
                        }

                        return activities
                    } catch (error) {
                        console.error('Background sync failed for investment activities:', error)
                    }
                }
            }

            // Fallback to cached activity when offline
            const localActivities = await offlineStorage.getAll(STORES.LEDGER_ACTIVITIES)
            const investmentActivities = localActivities.filter(item =>
                (item as any).activityType === 'created' || (item as any).activityType === 'updated'
            ) as InvestmentActivity[]

            if (investmentActivities.length > 0) {
                return investmentActivities.sort((a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
            }

            return []
        } catch (error) {
            console.error('Error getting investment activity log:', error)
            return []
        }
    }

    // Background sync method for investment activities
    private async syncActivityLogWithFirestore(): Promise<void> {
        if (!offlineStorage.isOnline()) return

        const db = getDb()
        if (!db) return

        try {
            const q = query(
                collection(db, this.activityCollectionName),
                orderBy('timestamp', 'desc')
            )
            const snapshot = await getDocs(q)

            const activities = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as InvestmentActivity[]

            // Update local storage
            for (const activity of activities) {
                await offlineStorage.put(STORES.LEDGER_ACTIVITIES, { ...activity, id: `investment-${activity.id}` })
            }
        } catch (error) {
            console.error('Background sync failed for investment activities:', error)
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
