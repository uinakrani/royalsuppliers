#!/usr/bin/env node

/**
 * Email Link Authentication Testing Script
 *
 * This script helps test the email link authentication flow.
 * Run this after deploying your changes to verify everything works.
 */

const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('🔗 Email Link Authentication Testing Guide')
console.log('========================================\n')

console.log('Before testing, ensure you have:')
console.log('✅ Enabled Email Link sign-in in Firebase Console')
console.log('✅ Added your production domain to Firebase Authorized Domains')
console.log('✅ Deployed the latest code with email link support\n')

console.log('Testing Steps:')
console.log('1. Open your PWA in a browser (mobile or desktop)')
console.log('2. Go to the login page')
console.log('3. Enter an email address in the "Sign in with Email Link" section')
console.log('4. Click "Send Magic Link"')
console.log('5. Check your email for the magic link')
console.log('6. Click the link in the email')
console.log('7. Verify you are redirected to /auth/finish and then logged in\n')

console.log('For PWA testing:')
console.log('- Install the PWA first (Add to Home Screen)')
console.log('- Send the magic link from the installed PWA')
console.log('- Click the link - it should open the installed PWA')
console.log('- You should be logged in automatically\n')

console.log('For mobile testing:')
console.log('- iOS: Ensure Universal Links are configured')
console.log('- Android: PWA should handle deep links automatically')
console.log('- Test both installed PWA and browser\n')

rl.question('Have you completed the Firebase Console setup? (y/n): ', (answer) => {
  if (answer.toLowerCase() !== 'y') {
    console.log('\n❌ Please complete Firebase Console setup first:')
    console.log('1. Go to Firebase Console → Authentication → Sign-in method')
    console.log('2. Enable "Email/Password" or "Email link"')
    console.log('3. Add your production domain to Authorized domains')
    process.exit(1)
  }

  rl.question('Have you deployed the latest code? (y/n): ', (deployed) => {
    if (deployed.toLowerCase() !== 'y') {
      console.log('\n❌ Please deploy your code first using: npm run build && npm run start')
      process.exit(1)
    }

    console.log('\n✅ Ready for testing!')
    console.log('\nTest URLs:')
    console.log('- Login page: https://yourdomain.com/login')
    console.log('- Auth callback: https://yourdomain.com/auth/finish')
    console.log('\nRemember to test on both mobile and desktop, with and without PWA installed.')

    rl.close()
  })
})