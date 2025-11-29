# Automatic Database Backup System

The app automatically backs up the database and stores it in Firestore. Backups are created:
- **On app open** if no backup was created in the last 12 hours
- **Automatic cleanup** of backups older than 3 months

## How It Works

1. **Auto Backup Scheduler Component** (`components/AutoBackupScheduler.tsx`):
   - Checks on app open if backup is needed (>12 hours since last backup)
   - Uses `/api/backup/status` to check last backup time
   - Triggers backup automatically if needed

2. **Backup API Routes**:
   - **`POST /api/backup`**: Creates a new backup and stores it in Firestore
   - **`GET /api/backup/status`**: Returns last backup time and whether backup is needed

3. **Backup Service** (`lib/backupService.ts`):
   - Exports all Firestore collections (orders, ledgerEntries, invoices, partyPayments)
   - Stores backup as a document in Firestore `backups` collection
   - Automatically cleans up backups older than 3 months after creating new backup
   - Provides functions to check last backup time and backup status

## Backup Storage

### Firestore Collection

Backups are stored as documents in the `backups` Firestore collection. Each backup document contains:
- All database collections (orders, ledgerEntries, invoices, partyPayments)
- Export metadata (exportDate, projectId, backupType)
- Backup metadata (backupId, fileName, createdAt, size, collectionCounts)

### Backup ID Format

```
backup-YYYY-MM-DD-HH-MM-SS
```

Example:
```
backup-2025-11-29-06-00-00
backup-2025-11-29-14-30-45
```

### Backup Structure

Each backup document in Firestore:
```json
{
  "exportDate": "2025-11-29T06:00:00.000Z",
  "projectId": "your-project-id",
  "backupType": "daily",
  "backupId": "backup-2025-11-29-06-00-00",
  "fileName": "backups/daily/db-dump-2025-11-29-06-00-00.json",
  "createdAt": "2025-11-29T06:00:00.000Z",
  "size": 123456,
  "collectionCounts": {
    "orders": 150,
    "ledgerEntries": 200,
    "invoices": 50,
    "partyPayments": 75
  },
  "orders": [...],
  "ledgerEntries": [...],
  "invoices": [...],
  "partyPayments": [...]
}
```

## Automatic Backup Features

- **On App Open**: Checks if backup is needed (>12 hours since last backup)
- **Automatic Cleanup**: Deletes backups older than 3 months automatically
- **Stored in Firestore**: All backups stored as documents in `backups` collection
- **No user interaction**: Completely automatic
- **Metadata included**: Export date, backup type, project ID, collection counts

## Manual Backup

You can also trigger a backup manually:

```bash
# Via API endpoint (POST)
curl -X POST http://localhost:3000/api/backup

# Or in browser console
fetch('/api/backup', { method: 'POST' }).then(r => r.json()).then(console.log)
```

### Check Backup Status

```bash
# Check last backup time and if backup is needed
curl http://localhost:3000/api/backup/status

# Or in browser console
fetch('/api/backup/status').then(r => r.json()).then(console.log)
```

The status endpoint returns:
```json
{
  "success": true,
  "lastBackupTime": "2025-11-29T06:00:00.000Z",
  "needsBackup": false,
  "hoursSinceLastBackup": 2.5
}
```

## Viewing Backups

### In Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Open the `backups` collection
5. View any backup document (contains full database export)

### Via API Response

When a backup completes, the API returns:
```json
{
  "success": true,
  "message": "Daily backup completed successfully",
  "backupId": "backup-2025-11-29-06-00-00",
  "fileName": "backups/daily/db-dump-2025-11-29-06-00-00.json",
  "timestamp": "2025-11-29T06:00:00.000Z"
}
```

## Restoring from Backup

To restore from a backup stored in Firestore:

1. Go to Firebase Console > Firestore Database > `backups` collection
2. Find the backup document you want to restore
3. Export the document data as JSON
4. Use the import script to restore:
   ```bash
   npm run import-db path/to/backup-document.json
   ```

Alternatively, you can read the backup directly from Firestore and restore it programmatically.

## Important Notes

### Backup Triggers

1. **On App Open**: Checks immediately when app loads if backup is needed (>12 hours)
2. **Automatic Cleanup**: Deletes backups older than 3 months after creating new backup

### App Must Be Open

The automatic backup requires the app to be open. When the app loads, it checks if a backup is needed. For truly automatic backups that don't require the app to be open:

1. **Option 1**: Use a cron service to call the API endpoint
   - Set up a cron job (Vercel Cron, GitHub Actions, etc.)
   - Call `POST /api/backup` at desired times
   - Use a secret key for security (CRON_SECRET env variable)

2. **Option 2**: Use Firebase Cloud Functions
   - Deploy a scheduled cloud function
   - Trigger backup automatically without app being open

### Current Implementation

The current implementation uses a client-side component that:
- ✅ Works automatically when app opens
- ✅ Checks on app open if backup is needed (>12 hours)
- ✅ No external services needed
- ✅ Automatic cleanup of old backups
- ❌ Requires app to be opened to trigger backup check
- ❌ Requires browser/device to be on

## Configuration

### Change Backup Interval

Edit `lib/backupService.ts` in the `isBackupNeeded` function:

```typescript
return hoursSinceLastBackup >= 12 // Change 12 to desired hours
```

### Change Cleanup Age

Edit `lib/backupService.ts` in the `cleanupOldBackups` function:

```typescript
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3) // Change 3 to desired months
```

### Disable Automatic Backup

Remove or comment out the component in `app/layout.tsx`:

```typescript
// <AutoBackupScheduler />
```

## Monitoring Backups

Check browser console for backup logs:
- `🔍 Checking backup status on app open...`
- `⏰ Backup needed! Last backup was X hours ago.`
- `🔄 Triggering automatic backup...`
- `✅ Automatic backup completed: backupId`
- `✅ Backup is up to date (X hours ago)`
- `❌ Automatic backup failed: error message`

## Troubleshooting

### Backup Not Running

1. **Check if app is open**: The scheduler only runs when app is active
2. **Check browser console**: Look for error messages
3. **Check Firebase Storage**: Verify backups are being uploaded
4. **Check API route**: Test manually by calling `/api/backup`

### Backup Creation Fails

1. **Verify Firestore is enabled** in Firebase Console
2. **Check Firestore Rules**: Ensure write permissions for `backups` collection
3. **Check environment variables**: Verify Firebase configuration
4. **Check network**: Ensure internet connection is available

### Firestore Quota

- Monitor Firestore usage
- Old backups (3+ months) are automatically deleted
- Consider adjusting cleanup age if needed
- Monitor backup document sizes

## Next Steps

For production, consider:
1. Adding authentication to backup API (already supports CRON_SECRET)
2. Implementing backup retention policy (already implemented - 3 months)
3. Setting up email notifications for backup failures
4. Using a server-side cron job instead of client-side scheduler
5. Exporting backups to external storage (S3, Google Cloud Storage)
6. Implementing backup compression to reduce Firestore document size
7. Adding backup verification/validation before storing

