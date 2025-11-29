/**
 * Import Database for Git Commit
 * Finds and imports the database dump for the current commit
 * 
 * Usage: npx ts-node scripts/import-db-for-commit.ts [commit-hash]
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { spawn } from 'child_process'

const backupsDir = path.join(__dirname, '..', 'backups')
const importScript = path.join(__dirname, 'import-db.ts')

function getCurrentCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: path.join(__dirname, '..') }).trim()
  } catch {
    throw new Error('Not in a git repository or unable to get commit hash')
  }
}

function findDumpForCommit(commitHash: string): string | null {
  if (!fs.existsSync(backupsDir)) {
    return null
  }

  const shortHash = commitHash.substring(0, 8)
  const files = fs.readdirSync(backupsDir)
  
  // Look for dump file with this commit hash
  const matchingFiles = files.filter(file => 
    file.startsWith('db-dump-') && 
    file.includes(shortHash) && 
    file.endsWith('.json')
  )

  if (matchingFiles.length === 0) {
    return null
  }

  // Return the most recent one (should be only one, but just in case)
  const sortedFiles = matchingFiles.sort().reverse()
  return path.join(backupsDir, sortedFiles[0])
}

function main() {
  const commitHash = process.argv[2] || getCurrentCommitHash()
  
  console.log(`🔍 Looking for database dump for commit: ${commitHash.substring(0, 8)}`)
  
  const dumpFile = findDumpForCommit(commitHash)
  
  if (!dumpFile) {
    console.error(`❌ No database dump found for commit ${commitHash.substring(0, 8)}`)
    console.log(`\nAvailable dumps in backups/ directory:`)
    
    if (fs.existsSync(backupsDir)) {
      const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'))
      if (files.length === 0) {
        console.log('   (no dump files found)')
      } else {
        files.forEach(file => {
          const filePath = path.join(backupsDir, file)
          const stats = fs.statSync(filePath)
          console.log(`   - ${file} (${new Date(stats.mtime).toLocaleString()})`)
        })
      }
    }
    
    process.exit(1)
  }

  console.log(`✅ Found dump file: ${path.basename(dumpFile)}`)
  console.log(`\n⚠️  WARNING: This will replace all current database data with the dump contents.`)
  console.log(`   Make sure you want to proceed before continuing.`)
  console.log(`\n📦 Importing database dump...`)
  console.log(`   File: ${dumpFile}\n`)

  // Run the import script
  const importProcess = spawn('npx', ['ts-node', '--project', 'tsconfig.scripts.json', importScript, dumpFile], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..')
  })

  importProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`\n✅ Database import completed!`)
    } else {
      console.error(`\n❌ Database import failed with exit code ${code}`)
      process.exit(code || 1)
    }
  })
}

main()

