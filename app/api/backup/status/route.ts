/**
 * API Route to check backup status
 * Returns information about last backup time and whether a backup is needed
 */

import { NextResponse } from 'next/server'
import { getLastBackupTime, isBackupNeeded } from '@/lib/backupService'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const lastBackupTime = await getLastBackupTime()
    const needsBackup = await isBackupNeeded()
    
    return NextResponse.json({
      success: true,
      lastBackupTime: lastBackupTime ? lastBackupTime.toISOString() : null,
      needsBackup,
      hoursSinceLastBackup: lastBackupTime 
        ? Math.round((Date.now() - lastBackupTime.getTime()) / (1000 * 60 * 60) * 10) / 10
        : null,
    }, { status: 200 })
  } catch (error: any) {
    console.error('Backup status API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}

