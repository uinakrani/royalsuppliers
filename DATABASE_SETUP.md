# Database Setup Guide

This guide explains how to set up and switch between production and development databases.

## Overview

The application supports two database environments:
- **Production**: Your live/production database (default)
- **Development**: A separate database for development and testing

## Initial Setup

### 1. Keep Production Database as Is

Your current database configuration in `.env.local` is your production database. **Do not change it.**

### 2. Create Development Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new Firebase project (or use an existing one) for development
3. Enable Firestore Database in the new project
4. Set up Firestore security rules (you can copy from production)

### 3. Configure Environment Variables

Add your development database configuration to `.env.local`:

```env
# Production Firebase Configuration (Keep existing values)
NEXT_PUBLIC_FIREBASE_API_KEY=your-production-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-production-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-production-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-production-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-production-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-production-app-id

# Development Firebase Configuration (Add these)
NEXT_PUBLIC_FIREBASE_DEV_API_KEY=your-development-api-key
NEXT_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN=your-development-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DEV_PROJECT_ID=your-development-project-id
NEXT_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET=your-development-project.appspot.com
NEXT_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID=your-development-messaging-sender-id
NEXT_PUBLIC_FIREBASE_DEV_APP_ID=your-development-app-id

# Environment Selection (default: production)
NEXT_PUBLIC_ENVIRONMENT=production
```

### 4. Copy Production Data to Development

Run the copy script to copy all data from production to development:

```bash
npm run copy-prod-to-dev
```

This script will:
- Connect to both production and development databases
- Copy all collections: `orders`, `invoices`, `ledgerEntries`, `partyPayments`
- Clear existing data in development (if any)
- Copy all documents with their IDs preserved

**⚠️ Important**: The script will warn you if production and development project IDs are the same to prevent accidental data loss.

## Switching Between Databases

### Use Development Database

Set the environment variable in `.env.local`:

```env
NEXT_PUBLIC_ENVIRONMENT=development
```

Then restart your development server:

```bash
npm run dev
```

### Use Production Database

Set the environment variable in `.env.local`:

```env
NEXT_PUBLIC_ENVIRONMENT=production
```

Or simply remove the line (production is the default).

Then restart your development server:

```bash
npm run dev
```

## Verifying Current Database

When the app starts, check the browser console. You should see:

```
Firebase initialized successfully { environment: 'development', projectId: '...', ... }
```

or

```
Firebase initialized successfully { environment: 'production', projectId: '...', ... }
```

## Best Practices

1. **Always use development database for testing new features**
2. **Never set `NEXT_PUBLIC_ENVIRONMENT=development` in production deployments**
3. **Regularly sync development database** by running `npm run copy-prod-to-dev` when production data changes
4. **Keep production database credentials secure** - never commit `.env.local` to version control

## Troubleshooting

### Script fails with "Development Firebase configuration is missing"

Make sure you've added all `NEXT_PUBLIC_FIREBASE_DEV_*` variables to your `.env.local` file.

### Can't connect to development database

1. Verify your development Firebase project exists
2. Check that Firestore is enabled in the development project
3. Verify all environment variables are correct
4. Check Firestore security rules allow read/write access

### Want to use same database for both

If you want to use the same database for both environments (not recommended), you can:
- Leave `NEXT_PUBLIC_ENVIRONMENT=production` (or unset it)
- Don't set the `NEXT_PUBLIC_FIREBASE_DEV_*` variables
- The app will use production config for both

## Scripts Reference

- `npm run copy-prod-to-dev` - Copy all data from production to development database
- `npm run export-db` - Export current database to JSON file
- `npm run import-db <file.json>` - Import data from JSON file to current database

