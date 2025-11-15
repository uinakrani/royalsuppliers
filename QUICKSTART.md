# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Firebase

1. **Create Firebase Project:**
   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project"
   - Enter project name and continue

2. **Enable Firestore:**
   - Go to "Firestore Database" in left menu
   - Click "Create database"
   - Start in test mode (for now)
   - Choose a location

3. **Get Your Config:**
   - Go to Project Settings (gear icon)
   - Scroll to "Your apps"
   - Click the web icon (`</>`)
   - Copy the config values

### Step 3: Create Environment File

Create `.env.local` in the root directory:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Step 4: Set Firestore Rules

In Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{document=**} {
      allow read, write: if true;
    }
  }
}
```

Click "Publish"

### Step 5: Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your mobile browser or Chrome DevTools mobile view.

## 📱 Testing on Mobile

### Option 1: Local Network
1. Find your computer's IP address
2. On your phone, open: `http://YOUR_IP:3000`
3. Make sure both devices are on the same WiFi

### Option 2: Deploy to Vercel (Free)
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables
5. Deploy!

## ✅ You're Ready!

- Add your first order
- View dashboard statistics
- Generate PDF invoices
- Filter and manage orders

## 🎨 Optional: Add PWA Icons

Create these files in the `public` folder:
- `icon-192x192.png` (192×192px)
- `icon-512x512.png` (512×512px)

Use tools like:
- [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
- [Favicon.io](https://favicon.io/)

The app works without icons, but they improve the PWA experience!

