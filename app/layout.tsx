import type { Metadata } from 'next'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import FirebaseSetupAlert from '@/components/FirebaseSetupAlert'
import FirestoreRulesAlert from '@/components/FirestoreRulesAlert'
import ToastContainer from '@/components/Toast'
import NativePopup from '@/components/NativePopup'
import '@/lib/firebaseTest' // Load test utility

export const metadata: Metadata = {
  title: 'Royal Suppliers - Order Management',
  description: 'Order and invoice management system',
  manifest: '/manifest.json',
  themeColor: '#2e31fb',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default', // Use default to show theme color properly
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
    'apple-mobile-web-app-status-bar-style': 'default',
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512x512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#2e31fb" />
        <meta name="theme-color" content="#2e31fb" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#2e31fb" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-title" content="Royal Suppliers" />
        <style dangerouslySetInnerHTML={{__html: `
          /* iOS Status Bar Color - Match header color (#2e31fb) */
          @supports (-webkit-touch-callout: none) {
            html {
              background-color: #2e31fb !important;
            }
            body {
              background-color: #f9fafb;
              /* Blue background at top for status bar area */
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 44px), #f9fafb env(safe-area-inset-top, 44px)) !important;
            }
            /* Ensure header background matches status bar */
            .bg-primary-600 {
              background-color: #2e31fb !important;
            }
            /* Make status bar area blue - extend header color to top */
            #__next {
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 0px), transparent env(safe-area-inset-top, 0px));
            }
            /* Ensure status bar area is blue in standalone mode */
            html.standalone {
              background-color: #2e31fb !important;
            }
            html.standalone body {
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 44px), #f9fafb env(safe-area-inset-top, 44px)) !important;
            }
            html.standalone #__next::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              height: env(safe-area-inset-top, 44px);
              background-color: #2e31fb !important;
              z-index: 9999;
              pointer-events: none;
            }
          }
          /* Android status bar color */
          @media (prefers-color-scheme: dark) {
            html {
              background-color: #2e31fb;
            }
          }
          @media (prefers-color-scheme: light) {
            html {
              background-color: #2e31fb;
            }
          }
        `}} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="application-name" content="Royal Suppliers" />
        <meta name="msapplication-TileColor" content="#2e31fb" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="bg-gray-50">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Detect if app is in standalone mode (PWA) and add class to html
              (function() {
                if (window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator.standalone === true) ||
                    document.referrer.includes('android-app://')) {
                  document.documentElement.classList.add('standalone');
                }
              })();
            `,
          }}
        />
        <NativePopup />
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

