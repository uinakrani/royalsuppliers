# Database Export/Import Scripts

These scripts allow you to export and import your Firestore database data.

## Prerequisites

1. Make sure you have a `.env.local` file in the root directory with your Firebase configuration:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Export Database

To create a backup of your current database:

```bash
npm run export-db
```

This will:
- Export all collections: `orders`, `ledgerEntries`, `invoices`, `partyPayments`
- Create a JSON file named `db-dump-YYYY-MM-DDTHH-MM-SS.json` in the root directory
- Include metadata about the export (date, project ID)

**Example output:**
```
🔥 Initializing Firebase...
✅ Connected to project: your-project-id

📦 Exporting collection: orders...
   ✅ Exported 150 documents

📦 Exporting collection: ledgerEntries...
   ✅ Exported 200 documents

📦 Exporting collection: invoices...
   ✅ Exported 25 documents

📦 Exporting collection: partyPayments...
   ✅ Exported 30 documents

✅ Database export completed!
📄 File saved to: db-dump-2024-01-15T10-30-00.json
```

## Import Database

To restore data from a dump file:

```bash
npm run import-db <dump-file.json>
```

**Example:**
```bash
npm run import-db db-dump-2024-01-15T10-30-00.json
```

This will:
- **Clear all existing data** from the collections being imported (by default)
- Read the dump file
- Import all collections back into Firestore
- Preserve document IDs from the original export
- Convert date strings back to Firestore Timestamps correctly:
  - `createdAt`, `updatedAt`, `createdAtTs`, `dueDate` → Firestore Timestamps
  - `date` in orders → kept as string (simple date format)
  - `date` in ledger entries → converted to Firestore Timestamp

**Options:**
- `--no-clear`: Keep existing data and merge instead of clearing first
  ```bash
  npm run import-db db-dump-2024-01-15T10-30-00.json --no-clear
  ```

**⚠️ Warning:** By default, this will **delete all existing data** in the collections before importing. Use `--no-clear` if you want to merge instead.

## File Format

The dump file is a JSON file with the following structure:

```json
{
  "exportDate": "2024-01-15T10:30:00.000Z",
  "projectId": "your-project-id",
  "orders": [
    {
      "id": "document-id",
      "partyName": "...",
      "date": "2024-01-15T10:30:00.000Z",
      ...
    }
  ],
  "ledgerEntries": [...],
  "invoices": [...],
  "partyPayments": [...]
}
```

## Notes

- **Export:** All Firestore Timestamps are exported as ISO strings, preserving full timestamp information
- **Import:** By default, clears all existing data before importing. Use `--no-clear` to merge instead
- The scripts preserve document IDs, so importing will restore documents with the same IDs
- Date fields are automatically converted:
  - **Export:** Firestore Timestamps → ISO strings
  - **Import:** ISO strings → Firestore Timestamps (where appropriate)
- The export includes all documents from the specified collections
- Make sure your Firestore security rules allow read/write access when running these scripts
- All timestamp fields (`createdAt`, `updatedAt`, `createdAtTs`, `dueDate`) are properly handled

