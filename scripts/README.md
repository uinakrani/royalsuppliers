# Database Scripts

## Export Database

### Manual Export
```bash
npm run export-db
```

Exports all Firestore collections to a JSON file in the root directory.

### Export for Git Commit
Used automatically by git post-commit hook:
```bash
npx ts-node --project tsconfig.scripts.json scripts/export-db-for-commit.ts <output-dir> <commit-hash>
```

Creates a database dump with the commit hash in the filename.

## Import Database

### Import from File
```bash
npm run import-db <dump-file.json>
```

Imports data from a dump file. **Warning:** This will replace all existing data by default.

### Import for Current Commit
```bash
npm run import-db-commit
```

Automatically finds and imports the database dump for the current git commit.

Example workflow:
```bash
# Checkout a specific commit
git checkout abc1234

# Import the database dump for that commit
npm run import-db-commit
```

## Git Hooks

### Post-commit Hook
After each commit, automatically:
1. Exports the current database
2. Names the dump file with the commit hash
3. Saves it to `backups/` directory

The dump file name format: `db-dump-YYYY-MM-DDTHH-MM-SS-COMMIT.json`

### Manual Hook Installation
The post-commit hook is automatically installed in `.git/hooks/post-commit`.

To reinstall or verify:
```bash
# Make sure it's executable
chmod +x .git/hooks/post-commit
```

## Backup Directory Structure

```
backups/
├── db-dump-2025-11-29T09-42-37-33fc9a97.json  # Commit 33fc9a97
├── db-dump-2025-11-29T10-15-22-a1b2c3d4.json  # Commit a1b2c3d4
└── ...
```

Each dump file includes:
- Export timestamp
- Commit hash (8 characters)
- All collections (orders, ledgerEntries, invoices, partyPayments)
- Git metadata (commit hash, branch, commit message)
