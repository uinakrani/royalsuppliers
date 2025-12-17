#!/usr/bin/env node

/**
 * Email Link Authentication Debug Script
 *
 * This script helps debug email link authentication issues
 */

const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('🔧 Email Link Authentication Debug Tool')
console.log('=======================================\n')

console.log('Common issues when email link is missing from Firebase emails:\n')

console.log('❌ POSSIBLE CAUSES:')
console.log('1. Email Link authentication not enabled in Firebase Console')
console.log('2. Domain not authorized in Firebase Console')
console.log('3. Wrong Firebase project configuration')
console.log('4. Firebase Auth domain mismatch')
console.log('5. Blaze plan not enabled (required for email sending)\n')

console.log('✅ DEBUGGING STEPS:')
console.log('1. Check Firebase Console → Authentication → Sign-in method')
console.log('2. Ensure "Email/Password" or "Email link" is ENABLED')
console.log('3. Check Authorized domains includes your domain')
console.log('4. Verify Blaze plan is active')
console.log('5. Check browser console for errors\n')

rl.question('Did you enable Email Link in Firebase Console? (y/n): ', (answer) => {
  if (answer.toLowerCase() !== 'y') {
    console.log('\n🔥 ACTION REQUIRED:')
    console.log('1. Go to Firebase Console: https://console.firebase.google.com')
    console.log('2. Select your project')
    console.log('3. Go to Authentication → Sign-in method')
    console.log('4. Enable "Email/Password" or "Email link"')
    console.log('5. Click Save')
    process.exit(1)
  }

  rl.question('Did you add your domain to Authorized domains? (y/n): ', (domain) => {
    if (domain.toLowerCase() !== 'y') {
      console.log('\n🔥 ACTION REQUIRED:')
      console.log('1. In Firebase Console → Authentication → Sign-in method')
      console.log('2. Scroll to "Authorized domains"')
      console.log('3. Add your production domain (e.g., yoursite.netlify.app)')
      console.log('4. For development, add "localhost"')
      console.log('5. Click Add domain')
      process.exit(1)
    }

    rl.question('Is Blaze plan enabled? (y/n): ', (blaze) => {
      if (blaze.toLowerCase() !== 'y') {
        console.log('\n🔥 ACTION REQUIRED:')
        console.log('Email authentication REQUIRES Blaze plan!')
        console.log('1. Firebase Console → Project Settings → Usage and billing')
        console.log('2. Click "Modify plan"')
        console.log('3. Select "Blaze (Pay as you go)"')
        console.log('4. Add credit card (won\'t be charged unless > free tier)')
        console.log('5. Wait 10-30 minutes for activation')
        process.exit(1)
      }

      console.log('\n✅ Firebase configuration looks good!')
      console.log('\n🔍 NEXT STEPS:')
      console.log('1. Check browser developer console for errors')
      console.log('2. Try sending email link again')
      console.log('3. Check Firebase Console → Authentication → Users')
      console.log('4. Verify email appears in spam/junk folder')
      console.log('5. Check Firebase Auth logs in Console')

      rl.question('\nWhat domain are you testing with? (e.g., localhost:3000, yoursite.com): ', (testDomain) => {
        console.log(`\n📧 Testing with domain: ${testDomain}`)
        console.log('\nIf still no magic link, the issue might be:')
        console.log('- Firebase project mismatch')
        console.log('- Domain not properly authorized')
        console.log('- Email link feature disabled')

        console.log('\n🆘 If nothing works:')
        console.log('1. Create new Firebase project for testing')
        console.log('2. Enable Email Link auth immediately')
        console.log('3. Add domain to authorized list')
        console.log('4. Enable Blaze plan')
        console.log('5. Test with simple HTML page first')

        rl.close()
      })
    })
  })
})