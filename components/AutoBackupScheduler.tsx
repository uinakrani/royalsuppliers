'use client'

/**
 * Auto Backup Scheduler Component
 * - Checks on app open if backup is needed (>12 hours since last backup)
 * This component should be included in the app layout
 */

import { useEffect, useRef } from 'react'

export default function AutoBackupScheduler() {
  const hasCheckedOnOpenRef = useRef<boolean>(false)

  const triggerBackup = async (reason: string = 'on app open') => {
    try {
      console.log(`🔄 Triggering automatic backup (${reason})...`)
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()
      
      if (result.success) {
        console.log('✅ Automatic backup completed:', result.backupId || result.fileName)
      } else {
        console.error('❌ Automatic backup failed:', result.error)
      }
    } catch (error: any) {
      console.error('❌ Error triggering backup:', error)
    }
  }

  const checkBackupStatus = async () => {
    try {
      const response = await fetch('/api/backup/status')
      const status = await response.json()
      
      if (status.success) {
        if (status.needsBackup) {
          const hoursAgo = status.hoursSinceLastBackup || 'unknown'
          console.log(`⏰ Backup needed! Last backup was ${hoursAgo} hours ago.`)
          await triggerBackup('more than 12 hours since last backup')
        } else if (status.lastBackupTime) {
          const hoursAgo = status.hoursSinceLastBackup || 0
          console.log(`✅ Backup is up to date (${hoursAgo} hours ago)`)
        } else {
          console.log('ℹ️  No previous backup found, creating first backup...')
          await triggerBackup('first backup')
        }
      }
    } catch (error: any) {
      console.error('❌ Error checking backup status:', error)
    }
  }

  useEffect(() => {
    // Check immediately on mount if backup is needed (>12 hours)
    if (!hasCheckedOnOpenRef.current) {
      hasCheckedOnOpenRef.current = true
      console.log('🔍 Checking backup status on app open...')
      checkBackupStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // This component doesn't render anything
  return null
}

