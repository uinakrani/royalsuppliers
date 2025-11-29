# Daily Database Backup Setup

This document explains how to set up automatic daily database backups at 6 AM.

## Overview

The daily backup system:
- Exports your database every day at 6:00 AM
- Saves dumps to `backups/daily/` directory
- Names files with date and time: `db-dump-daily-YYYY-MM-DD-HH-MM-SS.json`
- Logs backup status to `backups/daily/backup-log.txt`

## Setup Instructions

### Windows (Task Scheduler)

1. **Open PowerShell as Administrator**
   - Right-click PowerShell
   - Select "Run as Administrator"

2. **Run the setup script:**
   ```powershell
   cd C:\Users\ashis\Desktop\royalsuppliers\royalsuppliers
   .\scripts\setup-daily-backup.ps1
   ```

3. **Follow the prompts** - The script will:
   - Check for Node.js and npm
   - Create a Windows Scheduled Task
   - Schedule it to run daily at 6:00 AM

4. **Verify the task:**
   - Open Task Scheduler (`Win + R`, type `taskschd.msc`)
   - Look for task: `RoyalSuppliers-DailyBackup`
   - Check that it's scheduled for 6:00 AM daily

### Unix/Linux/Mac (Cron)

1. **Make the setup script executable:**
   ```bash
   chmod +x scripts/setup-daily-backup.sh
   ```

2. **Run the setup script:**
   ```bash
   ./scripts/setup-daily-backup.sh
   ```

3. **Follow the prompts** - The script will:
   - Check for Node.js and npm
   - Add a cron job
   - Schedule it to run daily at 6:00 AM

4. **Verify the cron job:**
   ```bash
   crontab -l
   ```
   You should see a line like:
   ```
   0 6 * * * cd /path/to/repo && npm run daily-backup >> backups/daily/backup-log.txt 2>&1
   ```

## Manual Testing

Test the backup script manually before setting up the scheduler:

```bash
npm run daily-backup
```

This will:
- Export the database
- Create a dump file in `backups/daily/`
- Log the backup to `backups/daily/backup-log.txt`

## Backup File Structure

Daily backups are stored in:
```
backups/daily/
├── db-dump-daily-2025-11-29-06-00-00.json
├── db-dump-daily-2025-11-30-06-00-00.json
├── db-dump-daily-2025-12-01-06-00-00.json
├── ...
└── backup-log.txt
```

Each backup file contains:
- All Firestore collections (orders, ledgerEntries, invoices, partyPayments)
- Export timestamp
- Backup type: "daily"

## Backup Log

All backup operations are logged to `backups/daily/backup-log.txt`:

```
2025-11-29T06:00:00.000Z - Backup completed: db-dump-daily-2025-11-29-06-00-00.json (64 total documents)
2025-11-30T06:00:00.000Z - Backup completed: db-dump-daily-2025-11-30-06-00-00.json (68 total documents)
```

Errors are also logged:
```
2025-12-01T06:00:00.000Z - ERROR: Firebase configuration is missing
```

## Managing Backups

### View Recent Backups
```bash
# Windows PowerShell
Get-ChildItem backups\daily\*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# Unix/Linux/Mac
ls -lt backups/daily/*.json | head -5
```

### View Backup Log
```bash
# Windows
type backups\daily\backup-log.txt

# Unix/Linux/Mac
cat backups/daily/backup-log.txt
```

### Clean Up Old Backups

You may want to delete backups older than a certain number of days:

**Windows PowerShell:**
```powershell
# Delete backups older than 30 days
Get-ChildItem backups\daily\*.json | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

**Unix/Linux/Mac:**
```bash
# Delete backups older than 30 days
find backups/daily -name "*.json" -mtime +30 -delete
```

Or use the cleanup script (if you have it):
```bash
npm run cleanup-backups -- --backups-dir backups/daily --keep 30
```

## Troubleshooting

### Task Not Running (Windows)

1. **Check Task Scheduler:**
   - Open Task Scheduler
   - Find `RoyalSuppliers-DailyBackup`
   - Check "Last Run Result" (should be 0x0 for success)

2. **Check Task History:**
   - Right-click the task → "View" → "All Events"
   - Look for errors

3. **Run manually:**
   - Right-click task → "Run"
   - Check if it completes successfully

4. **Check logs:**
   ```powershell
   type backups\daily\backup-log.txt
   ```

### Cron Job Not Running (Unix/Linux/Mac)

1. **Check cron service:**
   ```bash
   # Linux
   sudo systemctl status cron
   
   # Mac
   sudo launchctl list | grep cron
   ```

2. **Check cron logs:**
   ```bash
   # Check system logs
   grep CRON /var/log/syslog
   
   # Check user's cron log
   tail -f backups/daily/backup-log.txt
   ```

3. **Verify cron job exists:**
   ```bash
   crontab -l | grep daily-backup
   ```

4. **Test manually:**
   ```bash
   npm run daily-backup
   ```

### Backup Fails

Common issues:

1. **Firebase not configured:**
   - Check `.env.local` file exists
   - Verify Firebase credentials are correct

2. **Node.js/npm not in PATH:**
   - Full path to node/npm might be needed in scheduled task
   - Update the task action with full paths

3. **Permission issues:**
   - Ensure write permissions to `backups/daily/` directory
   - On Windows, task might need to run as a user with proper permissions

4. **Network issues:**
   - Ensure internet connection at 6 AM
   - Task might be configured to only run if network is available

## Modifying Schedule

### Windows

1. Open Task Scheduler
2. Find `RoyalSuppliers-DailyBackup`
3. Right-click → "Properties"
4. Go to "Triggers" tab
5. Edit trigger to change time
6. Click "OK"

### Unix/Linux/Mac

1. Edit crontab:
   ```bash
   crontab -e
   ```

2. Find the daily-backup line and modify:
   ```
   # Current (6 AM):
   0 6 * * * cd /path/to/repo && npm run daily-backup >> backups/daily/backup-log.txt 2>&1
   
   # Example: Change to 5 AM:
   0 5 * * * cd /path/to/repo && npm run daily-backup >> backups/daily/backup-log.txt 2>&1
   ```

3. Save and exit

## Disabling Daily Backup

### Windows

1. Open Task Scheduler
2. Find `RoyalSuppliers-DailyBackup`
3. Right-click → "Disable"

To remove completely:
1. Right-click → "Delete"

### Unix/Linux/Mac

1. Edit crontab:
   ```bash
   crontab -e
   ```

2. Comment out or delete the daily-backup line:
   ```
   # 0 6 * * * cd /path/to/repo && npm run daily-backup >> backups/daily/backup-log.txt 2>&1
   ```

3. Save and exit

## Restoring from Daily Backup

To restore from a daily backup:

```bash
npm run import-db backups/daily/db-dump-daily-2025-11-29-06-00-00.json
```

**Warning:** This will replace all current database data with the backup contents.

## Best Practices

1. **Monitor backups regularly** - Check the log file weekly
2. **Test restores periodically** - Ensure backups are working
3. **Keep multiple backups** - Don't rely on just one backup
4. **Store backups offsite** - Consider copying backups to cloud storage
5. **Document your backup strategy** - Know how to restore when needed

## Backup Retention

Consider implementing a retention policy:
- Keep last 7 days of daily backups
- Keep weekly backups for last 4 weeks
- Keep monthly backups for last 12 months

You can automate this with cleanup scripts or manual deletion of old files.

