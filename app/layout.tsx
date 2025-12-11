import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import AndroidFullscreen from '@/components/AndroidFullscreen'
import FirebaseSetupAlert from '@/components/FirebaseSetupAlert'
import FirestoreRulesAlert from '@/components/FirestoreRulesAlert'
import ToastContainer from '@/components/Toast'
import NativePopup from '@/components/NativePopup'
import AutoBackupScheduler from '@/components/AutoBackupScheduler'
import OfflineIndicator from '@/components/OfflineIndicator'
import { PopupStackProvider } from '@/contexts/PopupStackContext'
import '@/lib/firebaseTest' // Load test utility
import { AuthProvider } from '@/contexts/AuthContext'

const inter = Inter({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Royal Suppliers - Order Management',
  description: 'Order and invoice management system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default', // Use default to show theme color properly
    title: 'Royal Suppliers',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Royal Suppliers',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#2e31fb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.jpg" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
        <link rel="apple-touch-icon" sizes="192x192" href="/logo.jpg" />
        <link rel="apple-touch-icon" sizes="512x512" href="/logo.jpg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
          /* Hide browser UI on Android */
          html.android body {
            /* Force full viewport height */
            height: 100vh;
            height: 100dvh;
            overflow: hidden;
          }
          html.android #__next {
            height: 100vh;
            height: 100dvh;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
          }
          /* Hide address bar and browser chrome on Android */
          @media screen and (display-mode: standalone) {
            html.android {
              /* Ensure fullscreen on Android */
              position: fixed;
              width: 100%;
              height: 100%;
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
      <body className={`${inter.className} bg-gray-50`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Detect if app is in standalone mode (PWA) and add class to html
              (function() {
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                    window.matchMedia('(display-mode: fullscreen)').matches ||
                    (window.navigator.standalone === true) ||
                    document.referrer.includes('android-app://');
                
                if (isStandalone) {
                  document.documentElement.classList.add('standalone');
                }
                
                // Detect Android
                const isAndroid = /Android/i.test(navigator.userAgent);
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                
                if (isAndroid) {
                  document.documentElement.classList.add('android');
                }
                if (isIOS) {
                  document.documentElement.classList.add('ios');
                }
                
                // Request fullscreen for Android when in standalone/fullscreen mode
                if (isAndroid && isStandalone) {
                  // Try to enter fullscreen after a short delay
                  setTimeout(function() {
                    const doc = document.documentElement;
                    if (doc.requestFullscreen) {
                      doc.requestFullscreen().catch(function() {
                        // Fullscreen might require user gesture
                      });
                    } else if (doc.webkitRequestFullscreen) {
                      doc.webkitRequestFullscreen();
                    } else if (doc.mozRequestFullScreen) {
                      doc.mozRequestFullScreen();
                    } else if (doc.msRequestFullscreen) {
                      doc.msRequestFullscreen();
                    }
                  }, 500);
                }
              })();
            `,
          }}
        />
        <AuthProvider>
          <PopupStackProvider>
            <AutoBackupScheduler />
            <NativePopup />
            <PWARegister />
            <PWAInstallPrompt />
            <AndroidFullscreen />
            <FirebaseSetupAlert />
            <FirestoreRulesAlert />
            {/* <OfflineIndicator /> */}
            <ToastContainer />
            {children}
          </PopupStackProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

