# Automated Database Backup System

This project includes an automated database backup system that creates a backup on every code push. Each backup is versioned with the git commit hash, allowing you to restore the database state for any version of your code.

## How It Works

1. **On every push** to `main`, `master`, or `develop` branches, a GitHub Actions workflow automatically:
   - Exports your Firestore database
   - Includes git version metadata (commit hash, branch, tag, commit message)
   - Saves the backup to the `backups/` directory
   - Commits the backup back to the repository

2. **Backup files** are named with a timestamp and commit hash:
   - Format: `db-dump-YYYY-MM-DDTHH-MM-SS-COMMIT.json`
   - Example: `db-dump-2024-01-15T10-30-00-a1b2c3d4.json`

3. Each backup contains:
   - Full export of all collections (`orders`, `ledgerEntries`, `invoices`, `partyPayments`)
   - Export timestamp
   - Project ID
   - Git version information (commit hash, branch, tag, commit message, author)

## Setup

### 1. Configure GitHub Secrets

Add your Firebase configuration as GitHub Secrets in your repository settings:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add the following secrets:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

### 2. Enable GitHub Actions

The workflow is located at `.github/workflows/database-backup.yml`. It will automatically run on every push to the main branches.

### 3. Grant Permissions

Make sure your GitHub Actions have write permissions:
- Go to **Settings** → **Actions** → **General**
- Under "Workflow permissions", select **Read and write permissions**

## Manual Backup

You can also create a backup manually:

```bash
# Export to default backups directory
npm run export-db

# Export to a custom directory
npm run export-db ./custom-backups

# Export without git version info
npm run export-db -- --no-version
```

## Restoring from Backup

To restore the database from a backup file:

```bash
npm run import-db backups/db-dump-2024-01-15T10-30-00-a1b2c3d4.json
```

**⚠️ Warning:** By default, this will **clear all existing data** before importing. To merge instead:

```bash
npm run import-db backups/db-dump-2024-01-15T10-30-00-a1b2c3d4.json --no-clear
```

## Managing Backups

### Viewing Backups

All backups are stored in the `backups/` directory. An index file (`backups/README.md`) is automatically maintained with a list of all backups.

### Cleaning Up Old Backups

To remove old backups and keep only the most recent ones:

```bash
# Keep last 30 backups (default)
npm run cleanup-backups

# Keep last 50 backups
npm run cleanup-backups -- --keep 50

# Custom backups directory
npm run cleanup-backups -- --backups-dir ./custom-backups
```

## Backup File Structure

Each backup file is a JSON file with the following structure:

```json
{
  "exportDate": "2024-01-15T10:30:00.000Z",
  "projectId": "your-project-id",
  "version": {
    "commitHash": "a1b2c3d4e5f6...",
    "branch": "main",
    "tag": "v1.2.3",
    "commitMessage": "Add new feature",
    "author": "Your Name"
  },
  "orders": [...],
  "ledgerEntries": [...],
  "invoices": [...],
  "partyPayments": [...]
}
```

## Finding Backups by Version

### By Commit Hash

To find a backup for a specific commit:

```bash
# List backups with commit hash
ls backups/db-dump-*-COMMIT.json

# Find backup for specific commit
ls backups/db-dump-*-a1b2c3d4.json
```

### By Date

Backups include timestamps in their filenames:

```bash
# List backups from a specific date
ls backups/db-dump-2024-01-15*.json
```

## Restoring to a Specific Version

1. **Find the backup** for your desired commit:
   ```bash
   git log --oneline
   ls backups/db-dump-*-COMMIT.json
   ```

2. **Restore the backup**:
   ```bash
   npm run import-db backups/db-dump-YYYY-MM-DDTHH-MM-SS-COMMIT.json
   ```

3. **Verify the restore** by checking your database in Firebase Console

## Troubleshooting

### Backup Not Created on Push

1. Check GitHub Actions logs:
   - Go to **Actions** tab in your repository
   - Click on the failed workflow run
   - Review the error messages

2. Common issues:
   - Missing or incorrect GitHub Secrets
   - Firebase permissions not configured
   - Git permissions not enabled for Actions

### Backup Too Large

If backups are becoming too large:
- Clean up old backups regularly
- Consider excluding large collections if not needed
- Use `cleanup-backups` script to maintain a manageable number

### Cannot Restore Backup

- Ensure you're using the correct Firebase project
- Check that Firestore security rules allow write access
- Verify the backup file is not corrupted (check JSON format)

## Best Practices

1. **Don't commit sensitive data**: Ensure your Firestore security rules are properly configured
2. **Regular cleanup**: Run cleanup script periodically to manage disk space
3. **Test restores**: Periodically test restoring from backups to ensure they work
4. **Monitor backup size**: Large backups may slow down git operations
5. **Tag important versions**: Create git tags for releases to easily identify important backups

## Workflow Configuration

The backup workflow triggers on pushes to:
- `main`
- `master`
- `develop`

To modify which branches trigger backups, edit `.github/workflows/database-backup.yml`:

```yaml
on:
  push:
    branches:
      - main
      - your-custom-branch
```

## Security Notes

- Backups contain all your database data - keep them secure
- Backups are committed to your git repository - ensure repository access is properly controlled
- Consider excluding backups from public repositories or using encrypted backups
- Review Firebase security rules regularly

