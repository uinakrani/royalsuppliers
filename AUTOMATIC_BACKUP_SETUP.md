# Automatic Daily Backup Setup - Complete Guide

## Overview

The app automatically backs up the database every day at 6:00 AM and uploads the backup file to Firebase Storage. The backup is also tracked in Firestore for easy management.

## How It Works

### Automatic Backup Flow

1. **AutoBackupScheduler Component** (`components/AutoBackupScheduler.tsx`)
   - Runs in the background when app is open
   - Checks time every minute
   - Triggers backup automatically at 6:00 AM daily

2. **Backup API** (`app/api/backup/route.ts`)
   - Server-side endpoint for backup operations
   - Exports database via `backupService`

3. **Backup Service** (`lib/backupService.ts`)
   - Exports all Firestore collections
   - Uploads backup file to Firebase Storage
   - Creates backup metadata record in Firestore

## Setup Steps

### Step 1: Enable Firebase Storage

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Storage** in the left sidebar
4. Click **Get Started**
5. Start in **production mode** (or test mode for development)
6. Select a storage location
7. Click **Done**

### Step 2: Configure Storage Rules

In Firebase Console > Storage > Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow read/write to backups directory
    match /backups/{allPaths=**} {
      allow read, write: if true; // For development
      // For production, add authentication:
      // allow read: if true;
      // allow write: if request.auth != null;
    }
  }
}
```

Click **Publish**

### Step 3: Verify Environment Variables

Ensure `.env.local` has:
```env
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

### Step 4: Test the Backup

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Manually trigger backup:**
   - Open browser console
   - Run: `fetch('/api/backup').then(r => r.json()).then(console.log)`
   - Or visit: `http://localhost:3000/api/backup`

3. **Check Firebase Storage:**
   - Go to Firebase Console > Storage
   - Look in `backups/daily/` folder
   - You should see the backup file

## Backup Storage Locations

### Firebase Storage
- **Path**: `backups/daily/db-dump-YYYY-MM-DD-HH-MM-SS.json`
- **Access**: Firebase Console > Storage
- **Download**: Click file to download

### Firestore Tracking
- **Collection**: `backups`
- **Document ID**: `YYYY-MM-DD-HH-MM-SS`
- **Contains**: Metadata about each backup (file name, URL, size, date, etc.)

## Backup File Structure

Each backup file contains:
```json
{
  "exportDate": "2025-11-29T06:00:00.000Z",
  "projectId": "your-project-id",
  "backupType": "daily",
  "orders": [...],
  "ledgerEntries": [...],
  "invoices": [...],
  "partyPayments": [...]
}
```

## Automatic Backup Features

✅ **Runs at 6:00 AM daily** - Automatically triggers  
✅ **Uploads to Firebase Storage** - Cloud storage  
✅ **Tracks in Firestore** - Metadata collection for easy querying  
✅ **Once per day** - Prevents duplicate backups  
✅ **No user interaction** - Completely automatic  

## Viewing Backups

### In Firebase Console

1. **Storage Tab:**
   - Firebase Console > Storage
   - Navigate to `backups/daily/`
   - See all backup files
   - Click to download

2. **Firestore Tab:**
   - Firebase Console > Firestore Database
   - Open `backups` collection
   - See metadata for each backup
   - Includes download URL

### Programmatically

```typescript
// Get all backups from Firestore
const backupsRef = collection(db, 'backups')
const snapshot = await getDocs(backupsRef)
const backups = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}))
```

## Manual Backup

You can trigger a backup manually:

### Via API (GET)
```bash
curl http://localhost:3000/api/backup
```

### Via Browser
```javascript
fetch('/api/backup')
  .then(r => r.json())
  .then(data => {
    console.log('Backup completed:', data)
    console.log('Download URL:', data.downloadUrl)
  })
```

## Restoring from Backup

1. **Download from Firebase Storage:**
   - Go to Firebase Console > Storage
   - Navigate to `backups/daily/`
   - Download the backup file

2. **Import using script:**
   ```bash
   npm run import-db path/to/downloaded-backup.json
   ```

## Important Notes

### App Must Be Open

⚠️ **Current Limitation**: The automatic backup requires the app to be open and running at 6:00 AM.

### Solutions for Always-On Backup

For backups that don't require the app to be open:

1. **Use Vercel Cron Jobs** (if deployed on Vercel):
   ```javascript
   // vercel.json
   {
     "crons": [{
       "path": "/api/backup",
       "schedule": "0 6 * * *"
     }]
   }
   ```

2. **Use External Cron Service:**
   - GitHub Actions (free)
   - EasyCron
   - cron-job.org
   - Call your API endpoint at 6 AM

3. **Use Firebase Cloud Functions:**
   - Schedule a cloud function
   - Runs automatically on schedule

## Configuration

### Change Backup Time

Edit `components/AutoBackupScheduler.tsx`:
```typescript
const BACKUP_TIME = { hour: 7, minute: 30 } // Change to 7:30 AM
```

### Disable Automatic Backup

Remove from `app/layout.tsx`:
```typescript
// <AutoBackupScheduler />
```

## Monitoring

### Check Browser Console

Look for:
- `🔄 Triggering automatic daily backup...`
- `✅ Automatic backup completed: filename.json`
- `❌ Automatic backup failed: error`

### Check Firebase Storage

- Go to Storage > backups/daily/
- Verify files are being created daily
- Check file sizes are reasonable

### Check Firestore

- Go to Firestore > backups collection
- See metadata for each backup
- Verify timestamps are correct

## Troubleshooting

### Backup Not Running

1. **App not open**: Component only runs when app is active
2. **Check console**: Look for errors
3. **Test manually**: Call `/api/backup` endpoint
4. **Check Firebase**: Verify Storage is enabled

### Upload Fails

1. **Storage not enabled**: Enable in Firebase Console
2. **Storage rules**: Check write permissions
3. **Bucket name**: Verify `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is correct
4. **Network**: Check internet connection

### Storage Quota

- Monitor usage in Firebase Console
- Delete old backups if needed
- Implement retention policy

## Best Practices

1. **Enable Firebase Storage** before deploying
2. **Set up storage rules** for security
3. **Monitor backup size** to avoid quota issues
4. **Test backups regularly** to ensure they work
5. **Keep download URLs** for easy access
6. **Consider backup retention** (keep last 30-90 days)

## Example Usage

### Query Recent Backups

```typescript
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'

const db = getDb()
if (db) {
  const backupsRef = collection(db, 'backups')
  const q = query(backupsRef, orderBy('createdAt', 'desc'), limit(10))
  const snapshot = await getDocs(q)
  const recentBackups = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}
```

## Files Created

- `components/AutoBackupScheduler.tsx` - Automatic scheduler component
- `app/api/backup/route.ts` - Backup API endpoint
- `lib/backupService.ts` - Backup service logic
- `lib/firebase-server.ts` - Server-side Firebase initialization
- `AUTOMATIC_BACKUP_SETUP.md` - This documentation

## Summary

✅ Automatic daily backup at 6 AM  
✅ Uploads to Firebase Storage  
✅ Tracks in Firestore  
✅ No user interaction needed  
✅ Ready to use!  

The system is now fully set up and will automatically backup your database every day at 6:00 AM when the app is running.

