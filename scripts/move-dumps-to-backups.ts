/**
 * Move existing dump files to backups directory
 * Organizes existing dump files from root directory into backups/ directory
 * 
 * Usage: npx ts-node scripts/move-dumps-to-backups.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const rootDir = path.join(__dirname, '..')
const backupsDir = path.join(rootDir, 'backups')

function moveDumpsToBackups() {
  console.log('📦 Organizing database dump files...\n')

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
    console.log(`✅ Created backups directory: ${backupsDir}`)
  }

  // Find all dump files in root directory
  const files = fs.readdirSync(rootDir)
  const dumpFiles = files.filter(file => 
    file.startsWith('db-dump-') && file.endsWith('.json') && 
    fs.statSync(path.join(rootDir, file)).isFile()
  )

  if (dumpFiles.length === 0) {
    console.log('✅ No dump files found in root directory.')
    return
  }

  console.log(`Found ${dumpFiles.length} dump file(s) to move:\n`)

  let moved = 0
  let skipped = 0

  for (const file of dumpFiles) {
    const sourcePath = path.join(rootDir, file)
    const destPath = path.join(backupsDir, file)

    try {
      // Check if file already exists in backups directory
      if (fs.existsSync(destPath)) {
        const sourceStats = fs.statSync(sourcePath)
        const destStats = fs.statSync(destPath)
        
        // Compare file sizes and modification times
        if (sourceStats.size === destStats.size && 
            sourceStats.mtimeMs <= destStats.mtimeMs) {
          console.log(`⏭️  Skipping ${file} (already exists in backups)`)
          fs.unlinkSync(sourcePath) // Remove duplicate from root
          skipped++
          continue
        } else {
          // Files differ, rename source to avoid conflict
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
          const newName = file.replace('.json', `-moved-${timestamp}.json`)
          const newDestPath = path.join(backupsDir, newName)
          fs.copyFileSync(sourcePath, newDestPath)
          fs.unlinkSync(sourcePath)
          console.log(`✅ Moved ${file} → ${newName}`)
          moved++
          continue
        }
      }

      // Move file to backups directory
      fs.copyFileSync(sourcePath, destPath)
      fs.unlinkSync(sourcePath)
      console.log(`✅ Moved ${file}`)
      moved++
    } catch (error: any) {
      console.error(`❌ Error moving ${file}: ${error.message}`)
    }
  }

  console.log(`\n✅ Done!`)
  console.log(`   Moved: ${moved} file(s)`)
  if (skipped > 0) {
    console.log(`   Skipped (duplicates): ${skipped} file(s)`)
  }
  console.log(`   Location: ${backupsDir}`)
}

moveDumpsToBackups()

