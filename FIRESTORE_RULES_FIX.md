# 🔧 Fix Firestore Security Rules - URGENT

## The Problem
Your orders are timing out because Firestore security rules are blocking write operations.

## Quick Fix (5 minutes)

### Step 1: Open Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **orders-38fca**

### Step 2: Open Firestore Rules
1. Click on **"Firestore Database"** in the left menu
2. Click on the **"Rules"** tab at the top

### Step 3: Replace the Rules
**Copy and paste this EXACT code:**

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

### Step 4: Publish
1. Click the **"Publish"** button
2. Wait for confirmation that rules are published

### Step 5: Test
1. Go back to your app
2. Try saving an order again
3. It should work immediately!

## What These Rules Do
- `allow read, write: if true;` - Allows anyone to read and write to the `orders` collection
- This is for **development only**
- For production, you should add authentication

## If Rules Don't Exist
If you see "Create database" instead of Rules:
1. Click **"Create database"**
2. Choose **"Start in test mode"** (this sets permissive rules automatically)
3. Choose a location (select closest to you)
4. Click **"Enable"**
5. Then follow Step 2-4 above

## Verify Rules Are Active
After publishing, you should see:
- Green checkmark or "Published" status
- The rules you pasted should be visible in the editor

## Still Not Working?
1. Make sure you clicked **"Publish"** (not just Save)
2. Wait 10-30 seconds for rules to propagate
3. Refresh your browser
4. Try saving again

## Security Note
⚠️ These rules allow anyone to read/write. For production:
- Add Firebase Authentication
- Update rules to check `request.auth != null`
- Or implement custom authentication

