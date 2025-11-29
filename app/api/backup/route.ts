/**
 * API Route for Database Backup
 * Exports database and uploads to Firebase Storage
 * 
 * GET /api/backup - Manual backup
 * POST /api/backup - Scheduled backup (with optional secret key for security)
 */

import { NextRequest, NextResponse } from 'next/server'
import { exportAndUploadBackup } from '@/lib/backupService'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('📦 Starting manual backup via API...')

    const result = await exportAndUploadBackup('manual')

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Backup completed successfully',
        fileName: result.fileName,
        timestamp: new Date().toISOString(),
      }, { status: 200 })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Backup failed',
        error: result.error,
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Backup API error:', error)
    return NextResponse.json({
      success: false,
      message: 'Backup failed',
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Check for secret key for scheduled backups
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || ''

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized',
      }, { status: 401 })
    }

    console.log('📦 Starting scheduled backup via API...')

    const result = await exportAndUploadBackup('daily')

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Daily backup completed successfully',
        backupId: result.backupId,
        fileName: result.fileName,
        timestamp: new Date().toISOString(),
      }, { status: 200 })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Daily backup failed',
        error: result.error,
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Backup API error:', error)
    return NextResponse.json({
      success: false,
      message: 'Backup failed',
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}
