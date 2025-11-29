#!/bin/bash
# Setup script for daily database backup on Unix/Linux/Mac
# Creates a cron job that runs the backup at 6 AM daily

set -e

echo "========================================"
echo "Daily Database Backup - Cron Setup"
echo "========================================"
echo ""

# Get repository root directory
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -z "$REPO_ROOT" ]; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

echo "Repository root: $REPO_ROOT"
echo ""

# Get Node.js path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: Node.js not found. Please install Node.js first."
    exit 1
fi

echo "Node.js found: $NODE_PATH"
echo ""

# Get npm path
NPM_PATH=$(which npm)
if [ -z "$NPM_PATH" ]; then
    echo "❌ Error: npm not found. Please install npm first."
    exit 1
fi

echo "npm found: $NPM_PATH"
echo ""

SCRIPT_PATH="$REPO_ROOT/scripts/daily-backup.ts"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Error: Daily backup script not found at: $SCRIPT_PATH"
    exit 1
fi

echo "Backup script: $SCRIPT_PATH"
echo ""

# Build cron command
CRON_COMMAND="0 6 * * * cd $REPO_ROOT && $NPM_PATH run daily-backup >> $REPO_ROOT/backups/daily/backup-log.txt 2>&1"

echo "Cron job details:"
echo "  Schedule: Daily at 6:00 AM"
echo "  Command: npm run daily-backup"
echo "  Working Directory: $REPO_ROOT"
echo ""
echo "The following cron job will be added:"
echo "  $CRON_COMMAND"
echo ""

read -p "Do you want to add this cron job? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting without changes"
    exit 0
fi

# Create backups directory if it doesn't exist
mkdir -p "$REPO_ROOT/backups/daily"

# Backup current crontab
CRONTAB_BACKUP="$REPO_ROOT/.crontab.backup"
crontab -l > "$CRONTAB_BACKUP" 2>/dev/null || true

echo "Current crontab backed up to: $CRONTAB_BACKUP"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "daily-backup"; then
    echo "⚠️  A daily-backup cron job already exists"
    read -p "Do you want to remove and recreate it? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove existing daily-backup cron jobs
        crontab -l 2>/dev/null | grep -v "daily-backup" | crontab -
        echo "✓ Removed existing cron job"
    else
        echo "Exiting without changes"
        exit 0
    fi
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -

echo ""
echo "✅ Cron job added successfully!"
echo ""
echo "To view your cron jobs:"
echo "  crontab -l"
echo ""
echo "To remove this cron job:"
echo "  crontab -e"
echo "  (then delete the line containing 'daily-backup')"
echo ""
echo "To test the backup manually:"
echo "  npm run daily-backup"
echo ""

