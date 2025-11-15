# Netlify Deployment Guide

This guide will help you deploy your Next.js application to Netlify.

## Prerequisites

1. A Netlify account (sign up at https://www.netlify.com)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### Option 1: Deploy via Netlify UI (Recommended)

1. **Connect your repository:**
   - Log in to your Netlify account
   - Click "Add new site" → "Import an existing project"
   - Connect your Git provider (GitHub, GitLab, or Bitbucket)
   - Select your repository

2. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next` (Netlify plugin will handle this automatically)
   - The `netlify.toml` file is already configured, so Netlify will use those settings

3. **Set environment variables:**
   - Go to Site settings → Environment variables
   - Add the following Firebase environment variables:
     - `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
     - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
     - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
     - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
     - `NEXT_PUBLIC_FIREBASE_APP_ID`

4. **Deploy:**
   - Click "Deploy site"
   - Netlify will automatically install the `@netlify/plugin-nextjs` plugin
   - Wait for the build to complete

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify:**
   ```bash
   netlify login
   ```

3. **Initialize the site:**
   ```bash
   netlify init
   ```
   - Follow the prompts to link your site

4. **Set environment variables:**
   ```bash
   netlify env:set NEXT_PUBLIC_FIREBASE_API_KEY "your-api-key"
   netlify env:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN "your-auth-domain"
   netlify env:set NEXT_PUBLIC_FIREBASE_PROJECT_ID "your-project-id"
   netlify env:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET "your-storage-bucket"
   netlify env:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID "your-sender-id"
   netlify env:set NEXT_PUBLIC_FIREBASE_APP_ID "your-app-id"
   ```

5. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

## Important Notes

- The `netlify.toml` file is already configured with the necessary settings
- Netlify will automatically use the `@netlify/plugin-nextjs` plugin for Next.js support
- Make sure all your Firebase environment variables are set in Netlify's environment variables section
- After deployment, your site will be available at `https://your-site-name.netlify.app`

## Troubleshooting

- If the build fails, check the build logs in the Netlify dashboard
- Ensure all environment variables are set correctly
- Verify that your Firebase project is configured properly
- Check that your Firestore security rules allow the necessary operations

## Features

✅ Party name dropdown with available names from existing orders
✅ Option to add new party names
✅ Automatic deployment on git push (if connected to Git)
✅ Next.js 13+ support with Netlify plugin

