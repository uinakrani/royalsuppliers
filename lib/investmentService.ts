import { getDb } from './firebase'
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore'
import { offlineStorage, STORES } from './offlineStorage'
import { getActiveWorkspaceId, matchesActiveWorkspace, WORKSPACE_DEFAULTS } from './workspaceSession'

export interface InvestmentRecord {
    id?: string
    workspaceId?: string
    amount: number
    date: string
    note?: string
    createdAt?: string
    updatedAt?: string
}

export interface InvestmentActivity {
    id?: string
    workspaceId?: string
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
            const activeWorkspaceId = getActiveWorkspaceId()
            const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id
            if (offlineStorage.isOnline()) {
                const db = getDb()
                if (db) {
                    try {
                        const investmentSnapshot = await getDocs(collection(db, this.collectionName))

                        if (!investmentSnapshot.empty) {
                            for (const docSnap of investmentSnapshot.docs) {
                                const investment = {
                                    id: docSnap.id,
                                    ...docSnap.data()
                                } as InvestmentRecord

                                if (!investment.workspaceId) {
                                    investment.workspaceId = fallbackWorkspaceId
                                    try {
                                        updateDoc(doc(db, this.collectionName, docSnap.id), { workspaceId: fallbackWorkspaceId }).catch(() => {})
                                    } catch {
                                        // ignore best effort
                                    }
                                }

                                if (!matchesActiveWorkspace(investment)) {
                                    continue
                                }

                                await offlineStorage.put(STORES.INVESTMENTS, investment)
                                return investment
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching investment from Firestore:', error)
                    }
                }
            }

            // Fallback to cached value when offline or remote fails
            const localInvestments = await offlineStorage.getAll(STORES.INVESTMENTS)
            const scoped = localInvestments
                .map((inv) => (inv.workspaceId ? inv : { ...(inv as InvestmentRecord), workspaceId: fallbackWorkspaceId }))
                .filter(matchesActiveWorkspace)
            if (scoped.length > 0) {
                return scoped[0] as InvestmentRecord
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
            const workspaceId = getActiveWorkspaceId()

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
                    workspaceId,
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
                    workspaceId,
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
            const activeWorkspaceId = getActiveWorkspaceId()
            const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id

            if (offlineStorage.isOnline()) {
                const db = getDb()
                if (db) {
                    try {
                        const q = query(
                            collection(db, this.activityCollectionName),
                            orderBy('timestamp', 'desc')
                        )
                        const snapshot = await getDocs(q)

                        const activities: InvestmentActivity[] = []
                        for (const docSnap of snapshot.docs) {
                            const data = docSnap.data() as InvestmentActivity
                            const workspaceId = data.workspaceId || fallbackWorkspaceId
                            if (!matchesActiveWorkspace({ workspaceId })) continue

                            if (!data.workspaceId) {
                                // Best-effort tag legacy docs
                                try {
                                    await updateDoc(doc(db, this.activityCollectionName, docSnap.id), { workspaceId: fallbackWorkspaceId })
                                } catch { /* ignore */ }
                            }

                            activities.push({ id: docSnap.id, ...data, workspaceId })
                        }

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
            const investmentActivities = localActivities
                .map((item) => {
                    const workspaceId = (item as any).workspaceId || fallbackWorkspaceId
                    return { ...(item as any), workspaceId }
                })
                .filter((item) =>
                    ((item as any).activityType === 'created' || (item as any).activityType === 'updated') &&
                    matchesActiveWorkspace(item as any)
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
            const activeWorkspaceId = getActiveWorkspaceId()
            const fallbackWorkspaceId = WORKSPACE_DEFAULTS.id

            const q = query(
                collection(db, this.activityCollectionName),
                orderBy('timestamp', 'desc')
            )
            const snapshot = await getDocs(q)

            const activities: InvestmentActivity[] = []
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data() as InvestmentActivity
                const workspaceId = data.workspaceId || fallbackWorkspaceId
                if (!matchesActiveWorkspace({ workspaceId })) continue
                if (!data.workspaceId) {
                    try {
                        await updateDoc(doc(db, this.activityCollectionName, docSnap.id), { workspaceId: fallbackWorkspaceId })
                    } catch { /* ignore */ }
                }
                activities.push({ id: docSnap.id, ...data, workspaceId })
            }

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
            const workspaceId = getActiveWorkspaceId() || WORKSPACE_DEFAULTS.id

            await addDoc(collection(db, this.activityCollectionName), { ...activity, workspaceId })
        } catch (error) {
            console.error('Error logging investment activity:', error)
            // Don't throw - activity logging shouldn't break the main operation
        }
    }
}

export const investmentService = new InvestmentService()
