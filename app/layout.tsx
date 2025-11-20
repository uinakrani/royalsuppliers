import type { Metadata } from 'next'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import FirebaseSetupAlert from '@/components/FirebaseSetupAlert'
import FirestoreRulesAlert from '@/components/FirestoreRulesAlert'
import ToastContainer from '@/components/Toast'
import SweetAlertLoader from '@/components/SweetAlertLoader'
import '@/lib/firebaseTest' // Load test utility

export const metadata: Metadata = {
  title: 'Royal Suppliers - Order Management',
  description: 'Order and invoice management system',
  manifest: '/manifest.json',
  themeColor: '#0ea5e9',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Royal Suppliers',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    viewportFit: 'cover',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'Royal Suppliers',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512x512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Royal Suppliers" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="application-name" content="Royal Suppliers" />
        <meta name="msapplication-TileColor" content="#0ea5e9" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css" />
        <script
          src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"
          async
        ></script>
      </head>
      <body className="bg-gray-50">
        <SweetAlertLoader />
        <PWARegister />
        <PWAInstallPrompt />
        <FirebaseSetupAlert />
        <FirestoreRulesAlert />
        <ToastContainer />
        {children}
      </body>
    </html>
  )
}

