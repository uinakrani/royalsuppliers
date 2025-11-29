/**
 * Backup Service - Server-side database backup and storage
 * Stores backup as a document in Firestore 'backups' collection
 */

import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore'
import { getServerFirestore } from './firebase-server'

const COLLECTIONS = ['orders', 'ledgerEntries', 'invoices', 'partyPayments']

interface BackupData {
  exportDate: string
  projectId: string
  backupType: 'daily' | 'manual'
  orders?: any[]
  ledgerEntries?: any[]
  invoices?: any[]
  partyPayments?: any[]
  [key: string]: any
}

function processDocument(data: any): any {
  if (data === null || data === undefined) {
    return data
  }

  // Handle Firestore Timestamp
  if (data && typeof data.toDate === 'function') {
    try {
      return data.toDate().toISOString()
    } catch (e) {
      if (data.seconds !== undefined) {
        const date = new Date(data.seconds * 1000 + (data.nanoseconds || 0) / 1000000)
        return date.toISOString()
      }
      return data.toString()
    }
  }

  // Handle Firestore Timestamp-like objects
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try {
      const date = new Date(data.seconds * 1000 + (data.nanoseconds || 0) / 1000000)
      return date.toISOString()
    } catch (e) {
      return data.toString()
    }
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => processDocument(item))
  }

  // Handle objects
  if (typeof data === 'object' && !(data instanceof Date)) {
    const processed: any = {}
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        processed[key] = processDocument(data[key])
      }
    }
    return processed
  }

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString()
  }

  return data
}

export async function exportAndUploadBackup(backupType: 'daily' | 'manual' = 'daily'): Promise<{
  success: boolean
  backupId?: string
  fileName?: string
  error?: string
}> {
  try {
    // Initialize Firestore
    const db = getServerFirestore()
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''

    // Export all collections
    const backupData: BackupData = {
      exportDate: new Date().toISOString(),
      projectId,
      backupType,
    }

    console.log(`📦 Exporting ${COLLECTIONS.length} collections...`)

    for (const collectionName of COLLECTIONS) {
      try {
        const collectionRef = collection(db, collectionName)
        const snapshot = await getDocs(collectionRef)
        
        const documents: any[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          const processedData = processDocument(data)
          documents.push({
            id: doc.id,
            ...processedData,
          })
        })

        backupData[collectionName] = documents
        console.log(`   ✅ Exported ${documents.length} ${collectionName}`)
      } catch (error: any) {
        console.error(`   ❌ Error exporting ${collectionName}:`, error.message)
        backupData[collectionName] = []
      }
    }

    // Generate backup ID
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = today.toTimeString().split(' ')[0].replace(/:/g, '-') // HH-MM-SS
    const backupId = `backup-${dateStr}-${timeStr}`
    const fileName = `backups/daily/db-dump-${dateStr}-${timeStr}.json`

    // Store backup as document in Firestore 'backups' collection
    const backupRef = doc(collection(db, 'backups'), backupId)
    
    console.log(`📤 Storing backup in Firestore: ${backupId}`)
    await setDoc(backupRef, {
      ...backupData,
      fileName,
      backupId,
      size: JSON.stringify(backupData).length,
      collectionCounts: {
        orders: backupData.orders?.length || 0,
        ledgerEntries: backupData.ledgerEntries?.length || 0,
        invoices: backupData.invoices?.length || 0,
        partyPayments: backupData.partyPayments?.length || 0,
      },
      createdAt: new Date().toISOString(),
    })

    console.log(`✅ Backup stored successfully in Firestore!`)

    // Cleanup old backups (3 months) after creating new backup
    console.log(`🧹 Starting cleanup of old backups...`)
    try {
      const cleanupResult = await cleanupOldBackups()
      if (cleanupResult.success && cleanupResult.deletedCount) {
        console.log(`✅ Cleaned up ${cleanupResult.deletedCount} old backup(s)`)
      }
    } catch (cleanupError: any) {
      console.warn(`⚠️  Cleanup failed (non-fatal):`, cleanupError.message)
      // Don't fail the backup if cleanup fails
    }

    return {
      success: true,
      backupId,
      fileName,
    }
  } catch (error: any) {
    console.error('❌ Backup failed:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Get the timestamp of the most recent backup
 */
export async function getLastBackupTime(): Promise<Date | null> {
  try {
    const db = getServerFirestore()
    const backupsRef = collection(db, 'backups')
    
    // Query for the most recent backup
    const q = query(backupsRef, orderBy('createdAt', 'desc'), limit(1))
    const snapshot = await getDocs(q)
    
    if (snapshot.empty) {
      return null // No backups found
    }
    
    const lastBackup = snapshot.docs[0].data()
    const createdAt = lastBackup.createdAt
    
    // Handle different date formats
    if (createdAt instanceof Date) {
      return createdAt
    }
    
    if (typeof createdAt === 'string') {
      return new Date(createdAt)
    }
    
    // Handle Firestore Timestamp
    if (createdAt && typeof createdAt.toDate === 'function') {
      return createdAt.toDate()
    }
    
    if (createdAt && createdAt.seconds) {
      return new Date(createdAt.seconds * 1000)
    }
    
    // Fallback to exportDate
    if (lastBackup.exportDate) {
      return new Date(lastBackup.exportDate)
    }
    
    return null
  } catch (error: any) {
    console.error('Error getting last backup time:', error)
    return null
  }
}

/**
 * Check if a backup is needed (more than 12 hours since last backup)
 */
export async function isBackupNeeded(): Promise<boolean> {
  const lastBackupTime = await getLastBackupTime()
  
  if (!lastBackupTime) {
    return true // No backup exists, need one
  }
  
  const now = new Date()
  const hoursSinceLastBackup = (now.getTime() - lastBackupTime.getTime()) / (1000 * 60 * 60)
  
  return hoursSinceLastBackup >= 12
}

/**
 * Cleanup backups older than 3 months
 */
export async function cleanupOldBackups(): Promise<{
  success: boolean
  deletedCount?: number
  error?: string
}> {
  try {
    const db = getServerFirestore()
    const backupsRef = collection(db, 'backups')
    
    // Calculate 3 months ago
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    
    console.log(`🧹 Cleaning up backups older than ${threeMonthsAgo.toISOString()}`)
    
    // Get all backups
    const snapshot = await getDocs(backupsRef)
    let deletedCount = 0
    const batches: Promise<void>[] = []
    
    snapshot.forEach((backupDoc) => {
      const backupData = backupDoc.data()
      let backupDate: Date | null = null
      
      // Parse the date from various possible formats
      if (backupData.createdAt) {
        if (backupData.createdAt instanceof Date) {
          backupDate = backupData.createdAt
        } else if (typeof backupData.createdAt === 'string') {
          backupDate = new Date(backupData.createdAt)
        } else if (backupData.createdAt.toDate) {
          backupDate = backupData.createdAt.toDate()
        } else if (backupData.createdAt.seconds) {
          backupDate = new Date(backupData.createdAt.seconds * 1000)
        }
      }
      
      // Fallback to exportDate
      if (!backupDate && backupData.exportDate) {
        backupDate = new Date(backupData.exportDate)
      }
      
      // If we couldn't determine the date, skip this backup
      if (!backupDate || isNaN(backupDate.getTime())) {
        console.warn(`⚠️  Could not determine date for backup ${backupDoc.id}, skipping`)
        return
      }
      
      // Delete if older than 3 months
      if (backupDate < threeMonthsAgo) {
        const deletePromise = deleteDoc(doc(db, 'backups', backupDoc.id))
        batches.push(deletePromise.then(() => {
          deletedCount++
          console.log(`   🗑️  Deleted old backup: ${backupDoc.id} (${backupDate?.toISOString()})`)
        }))
      }
    })
    
    // Wait for all deletions to complete
    await Promise.all(batches)
    
    console.log(`✅ Cleanup completed: ${deletedCount} old backup(s) deleted`)
    
    return {
      success: true,
      deletedCount,
    }
  } catch (error: any) {
    console.error('❌ Cleanup failed:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}
