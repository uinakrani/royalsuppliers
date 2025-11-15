import type { Metadata } from 'next'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import FirebaseSetupAlert from '@/components/FirebaseSetupAlert'
import FirestoreRulesAlert from '@/components/FirestoreRulesAlert'
import ToastContainer from '@/components/Toast'
import SweetAlertLoader from '@/components/SweetAlertLoader'
import '@/lib/firebaseTest' // Load test utility

export const metadata: Metadata = {
  title: 'Order Management System',
  description: 'Sand order management PWA',
  manifest: '/manifest.json',
  themeColor: '#0ea5e9',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OrderMgt',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css" />
        <script
          src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"
          async
        ></script>
      </head>
      <body className="bg-gray-50">
        <SweetAlertLoader />
        <PWARegister />
        <FirebaseSetupAlert />
        <FirestoreRulesAlert />
        <ToastContainer />
        {children}
      </body>
    </html>
  )
}

