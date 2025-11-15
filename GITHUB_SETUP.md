# GitHub Push Setup Guide

## ⚠️ Repository Not Found

If you get "repository not found" error, you need to **create the repository on GitHub first**.

## Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `order` (or any name you prefer)
3. Choose **Public** or **Private**
4. **DO NOT** initialize with README, .gitignore, or license (we already have files)
5. Click **"Create repository"**

## Step 2: Authentication Required

GitHub no longer accepts passwords for HTTPS authentication. You need to use a **Personal Access Token (PAT)**.

## Steps to Push to GitHub

### Option 1: Using Personal Access Token (Recommended)

1. **Create a Personal Access Token:**
   - Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name (e.g., "Order Management App")
   - Select scopes: Check `repo` (full control of private repositories)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

2. **Push using the token:**
   ```bash
   git push -u origin main
   ```
   - When prompted for username: Enter `Nakrani`
   - When prompted for password: **Paste your Personal Access Token** (not your GitHub password)

### Option 2: Using SSH (Alternative)

1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "ashish.nakrani.60@gmail.com"
   ```
   - Press Enter to accept default location
   - Optionally set a passphrase

2. **Add SSH key to GitHub:**
   - Copy your public key:
     ```bash
     cat ~/.ssh/id_ed25519.pub
     ```
   - Go to GitHub.com → Settings → SSH and GPG keys → New SSH key
   - Paste the key and save

3. **Change remote to SSH:**
   ```bash
   git remote set-url origin git@github.com:Nakrani/order.git
   ```

4. **Push:**
   ```bash
   git push -u origin main
   ```

### Option 3: Use GitHub CLI (gh)

If you have GitHub CLI installed:
```bash
gh auth login
git push -u origin main
```

## Current Configuration

- **Repository**: https://github.com/Nakrani/order.git
- **Username**: Nakrani
- **Email**: ashish.nakrani.60@gmail.com

## Quick Start (After Creating Repository)

1. **Create Personal Access Token:**
   - Go to: https://github.com/settings/tokens/new
   - Name: "Order App"
   - Expiration: Choose your preference
   - Scopes: Check `repo` (all)
   - Click "Generate token"
   - **Copy the token**

2. **Push your code:**
   ```bash
   git push -u origin main
   ```
   - Username: `Nakrani`
   - Password: **Paste your Personal Access Token** (not your GitHub password)

## Troubleshooting

### "Repository not found"
- Make sure you created the repository on GitHub first
- Verify the repository name matches: `order`
- Check your GitHub username is correct: `Nakrani`

### "Permission denied"
1. Verify the repository exists on GitHub under your account
2. Make sure you have write access to the repository
3. Check that your Personal Access Token has `repo` scope enabled
4. Try using SSH instead of HTTPS

### Wrong repository URL
If your repository has a different name or is under an organization:
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

