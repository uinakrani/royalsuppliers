# Commit-Based Database Dumps

This system automatically creates a database dump after each commit, allowing you to restore the exact database state for any commit.

## How It Works

1. **After each commit**, a git hook automatically:
   - Exports the current database
   - Creates a dump file named with the commit hash
   - Saves it to the `backups/` directory

2. **When checking out a commit**, you can:
   - Find the dump file for that commit
   - Import it to restore the database state

## Automatic Export

The post-commit hook runs automatically after every `git commit`. It:
- Gets the current commit hash
- Exports the database using `scripts/export-db-for-commit.ts`
- Saves the dump as `backups/db-dump-YYYY-MM-DDTHH-MM-SS-COMMIT.json`

### Example Dump File

```
backups/db-dump-2025-11-29T10-15-22-33fc9a97.json
```

Where:
- `2025-11-29T10-15-22` = Export timestamp
- `33fc9a97` = First 8 characters of commit hash

## Importing Database for a Commit

### Method 1: Automatic Import Script

```bash
# Checkout the commit you want
git checkout 33fc9a97

# Import the database dump for that commit
npm run import-db-commit
```

The script will:
1. Find the dump file matching the current commit hash
2. Warn you that it will replace all current data
3. Import the dump

### Method 2: Manual Import

```bash
# Checkout the commit
git checkout 33fc9a97

# Find the dump file
ls backups/db-dump-*-33fc9a97.json

# Import it manually
npm run import-db backups/db-dump-2025-11-29T10-15-22-33fc9a97.json
```

## Git Hook Setup

The post-commit hook is located at `.git/hooks/post-commit`.

### For Unix/Linux/Mac (Git Bash):
The hook uses bash and should work automatically.

### For Windows:
If using Git Bash (default), the bash hook works. If you need PowerShell support, you can use:
- `.git/hooks/post-commit.ps1` - PowerShell version
- `.git/hooks/post-commit.bat` - Batch wrapper

### Making Hook Executable (if needed)

```bash
# Unix/Linux/Mac
chmod +x .git/hooks/post-commit

# Windows (Git Bash)
chmod +x .git/hooks/post-commit
```

## Manual Database Export

You can also export the database manually:

```bash
# Export with current commit hash
npx ts-node --project tsconfig.scripts.json scripts/export-db-for-commit.ts backups

# Export with specific commit hash
npx ts-node --project tsconfig.scripts.json scripts/export-db-for-commit.ts backups abc1234
```

## Workflow Example

```bash
# 1. Make code changes
# ... edit files ...

# 2. Commit your changes
git add .
git commit -m "Add new feature"

# 3. Post-commit hook automatically runs:
#    - Exports database
#    - Creates dump file in backups/
#    - Shows confirmation message

# 4. Later, to restore database state for this commit:
git checkout <commit-hash>
npm run import-db-commit
```

## Backup Directory

All dumps are stored in `backups/` directory:

```
backups/
├── db-dump-2025-11-29T09-42-37-33fc9a97.json  # Commit 33fc9a97
├── db-dump-2025-11-29T10-15-22-a1b2c3d4.json  # Commit a1b2c3d4
└── ...
```

Each dump file contains:
- All Firestore collections (orders, ledgerEntries, invoices, partyPayments)
- Export timestamp
- Commit hash
- Commit message
- Branch name
- Git tag (if any)

## Troubleshooting

### Hook Not Running

1. **Check if hook exists:**
   ```bash
   ls -la .git/hooks/post-commit
   ```

2. **Make it executable:**
   ```bash
   chmod +x .git/hooks/post-commit
   ```

3. **Test manually:**
   ```bash
   .git/hooks/post-commit
   ```

### Dump Not Found for Commit

- Check if dump file exists: `ls backups/db-dump-*-COMMIT.json`
- The dump might not exist if:
  - Hook didn't run on that commit
  - Commit is from before hook was set up
  - Export failed silently

### Import Fails

- Check Firebase configuration in `.env.local`
- Verify dump file is valid JSON
- Check Firestore permissions
- Review error messages in console

## Important Notes

⚠️ **Warning**: Importing a dump will replace ALL current database data.

💡 **Tip**: Consider creating a backup before importing:
```bash
npm run export-db  # Create backup first
npm run import-db-commit  # Then import
```

📦 **Storage**: Dump files are stored in `backups/` directory. This directory is tracked by git by default. If dumps become large, you may want to ignore them in `.gitignore`.

## Scripts Reference

- `npm run export-db` - Manual export (current state)
- `npm run import-db <file>` - Import from file
- `npm run import-db-commit` - Import for current commit
- `scripts/export-db-for-commit.ts` - Export with commit hash
- `scripts/import-db-for-commit.ts` - Find and import for commit

