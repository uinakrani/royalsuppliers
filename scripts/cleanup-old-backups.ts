/**
 * Cleanup Old Database Backups
 * Removes old backup files, keeping only the most recent N backups
 * 
 * Usage: npx ts-node scripts/cleanup-old-backups.ts [--keep N] [--backups-dir path]
 */

import * as fs from 'fs'
import * as path from 'path'

const DEFAULT_KEEP = 30 // Keep last 30 backups
const DEFAULT_BACKUPS_DIR = path.join(__dirname, '..', 'backups')

interface BackupFile {
  filepath: string
  filename: string
  modifiedTime: number
  size: number
}

function getBackupFiles(backupsDir: string): BackupFile[] {
  if (!fs.existsSync(backupsDir)) {
    return []
  }

  const files = fs.readdirSync(backupsDir)
  const backupFiles: BackupFile[] = []

  for (const file of files) {
    if (file.startsWith('db-dump-') && file.endsWith('.json')) {
      const filepath = path.join(backupsDir, file)
      const stats = fs.statSync(filepath)
      
      backupFiles.push({
        filepath,
        filename: file,
        modifiedTime: stats.mtimeMs,
        size: stats.size,
      })
    }
  }

  // Sort by modified time (newest first)
  return backupFiles.sort((a, b) => b.modifiedTime - a.modifiedTime)
}

function cleanupOldBackups(keepCount: number = DEFAULT_KEEP, backupsDir: string = DEFAULT_BACKUPS_DIR) {
  console.log(`🧹 Cleaning up old backups...`)
  console.log(`   Keeping: ${keepCount} most recent backups`)
  console.log(`   Directory: ${backupsDir}`)
  console.log()

  const backupFiles = getBackupFiles(backupsDir)

  if (backupFiles.length === 0) {
    console.log('✅ No backup files found.')
    return
  }

  console.log(`📦 Found ${backupFiles.length} backup file(s)`)

  if (backupFiles.length <= keepCount) {
    console.log(`✅ All backups are within the limit (${keepCount}). No cleanup needed.`)
    console.log()
    console.log('Current backups:')
    backupFiles.forEach((file, index) => {
      const sizeKB = (file.size / 1024).toFixed(2)
      const date = new Date(file.modifiedTime).toISOString()
      console.log(`   ${index + 1}. ${file.filename} (${sizeKB} KB, ${date})`)
    })
    return
  }

  const toKeep = backupFiles.slice(0, keepCount)
  const toDelete = backupFiles.slice(keepCount)

  console.log(`   ✅ Keeping: ${toKeep.length} file(s)`)
  console.log(`   🗑️  Deleting: ${toDelete.length} file(s)`)
  console.log()

  let totalSizeDeleted = 0
  let deletedCount = 0

  for (const file of toDelete) {
    try {
      fs.unlinkSync(file.filepath)
      totalSizeDeleted += file.size
      deletedCount++
      console.log(`   ✅ Deleted: ${file.filename} (${(file.size / 1024).toFixed(2)} KB)`)
    } catch (error: any) {
      console.error(`   ❌ Failed to delete ${file.filename}: ${error.message}`)
    }
  }

  console.log()
  console.log(`✅ Cleanup complete!`)
  console.log(`   Deleted: ${deletedCount} file(s)`)
  console.log(`   Freed: ${(totalSizeDeleted / 1024 / 1024).toFixed(2)} MB`)
  console.log(`   Remaining: ${toKeep.length} backup(s)`)
}

// Parse command line arguments
const args = process.argv.slice(2)
let keepCount = DEFAULT_KEEP
let backupsDir = DEFAULT_BACKUPS_DIR

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep' && args[i + 1]) {
    keepCount = parseInt(args[i + 1], 10)
    if (isNaN(keepCount) || keepCount < 1) {
      console.error('❌ Error: --keep must be followed by a positive number')
      process.exit(1)
    }
  } else if (args[i] === '--backups-dir' && args[i + 1]) {
    backupsDir = path.isAbsolute(args[i + 1]) 
      ? args[i + 1]
      : path.join(process.cwd(), args[i + 1])
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: npx ts-node scripts/cleanup-old-backups.ts [options]')
    console.log()
    console.log('Options:')
    console.log('  --keep N           Keep the N most recent backups (default: 30)')
    console.log('  --backups-dir PATH Directory containing backups (default: ./backups)')
    console.log('  --help, -h         Show this help message')
    console.log()
    console.log('Examples:')
    console.log('  npx ts-node scripts/cleanup-old-backups.ts')
    console.log('  npx ts-node scripts/cleanup-old-backups.ts --keep 50')
    console.log('  npx ts-node scripts/cleanup-old-backups.ts --backups-dir ./custom-backups')
    process.exit(0)
  }
}

cleanupOldBackups(keepCount, backupsDir)

