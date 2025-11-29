# PowerShell script to set up Windows Task Scheduler for daily database backups at 6 AM
# Run this script as Administrator to create the scheduled task

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Daily Database Backup - Task Scheduler Setup" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  Warning: This script should be run as Administrator" -ForegroundColor Yellow
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne 'y') {
        exit
    }
}

# Get repository root directory
$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    Write-Host "❌ Error: Not in a git repository" -ForegroundColor Red
    exit 1
}

Write-Host "Repository root: $repoRoot" -ForegroundColor Green
Write-Host ""

# Get Node.js path
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "❌ Error: Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

$nodeExe = $nodePath.Path
Write-Host "Node.js found: $nodeExe" -ForegroundColor Green

# Get npm path
$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) {
    Write-Host "❌ Error: npm not found. Please install npm first." -ForegroundColor Red
    exit 1
}

Write-Host "npm found: $npmPath" -ForegroundColor Green
Write-Host ""

# Task details
$taskName = "RoyalSuppliers-DailyBackup"
$taskDescription = "Daily database backup for Royal Suppliers at 6 AM"
$scriptPath = Join-Path $repoRoot "scripts\daily-backup.ts"

# Check if script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Error: Daily backup script not found at: $scriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "Backup script: $scriptPath" -ForegroundColor Green
Write-Host ""

# Build the command to run
$command = "npx"
$arguments = "ts-node --project tsconfig.scripts.json scripts/daily-backup.ts"

Write-Host "Task Details:" -ForegroundColor Yellow
Write-Host "  Task Name: $taskName" -ForegroundColor White
Write-Host "  Schedule: Daily at 6:00 AM" -ForegroundColor White
Write-Host "  Command: $command $arguments" -ForegroundColor White
Write-Host "  Working Directory: $repoRoot" -ForegroundColor White
Write-Host ""

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "⚠️  Task '$taskName' already exists" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to remove and recreate it? (y/n)"
    if ($overwrite -eq 'y') {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "✓ Removed existing task" -ForegroundColor Green
    } else {
        Write-Host "Exiting without changes" -ForegroundColor Yellow
        exit
    }
}

Write-Host "Creating scheduled task..." -ForegroundColor Cyan

# Create action (what to run)
$action = New-ScheduledTaskAction -Execute $command -Argument $arguments -WorkingDirectory $repoRoot

# Create trigger (when to run - daily at 6 AM)
$trigger = New-ScheduledTaskTrigger -Daily -At "6:00 AM"

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew

# Create principal (run as current user)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description $taskDescription | Out-Null

    Write-Host ""
    Write-Host "✅ Scheduled task created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Task Information:" -ForegroundColor Yellow
    Write-Host "  Name: $taskName" -ForegroundColor White
    Write-Host "  Schedule: Daily at 6:00 AM" -ForegroundColor White
    Write-Host "  Next Run: " -NoNewline -ForegroundColor White
    
    $nextRun = (Get-ScheduledTask -TaskName $taskName).Triggers | Select-Object -ExpandProperty StartBoundary -ErrorAction SilentlyContinue
    if ($nextRun) {
        Write-Host "$nextRun" -ForegroundColor Cyan
    } else {
        Write-Host "See Task Scheduler" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "To manage the task:" -ForegroundColor Yellow
    Write-Host "  - Open Task Scheduler (taskschd.msc)" -ForegroundColor White
    Write-Host "  - Look for: $taskName" -ForegroundColor White
    Write-Host ""
    Write-Host "To test the backup manually:" -ForegroundColor Yellow
    Write-Host "  npm run daily-backup" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error creating scheduled task: $_" -ForegroundColor Red
    exit 1
}

