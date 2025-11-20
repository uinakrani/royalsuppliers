'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package, FileText, Wallet } from 'lucide-react'

export default function NavBar() {
  const pathname = usePathname()

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg" 
      style={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        minHeight: '4rem',
        height: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        margin: 0,
        paddingTop: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        /* Ensure it goes all the way to the bottom */
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)'
      }}
    >
      <div className="flex justify-around items-center" style={{ height: '4rem', minHeight: '4rem' }}>
        <Link
          href="/"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <Home size={24} />
          <span className="text-[10px] mt-1">Dashboard</span>
        </Link>
        <Link
          href="/orders"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/orders' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <Package size={24} />
          <span className="text-[10px] mt-1">Orders</span>
        </Link>
        <Link
          href="/ledger"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/ledger' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <Wallet size={24} />
          <span className="text-[10px] mt-1">Ledger</span>
        </Link>
        <Link
          href="/invoices"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/invoices' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <FileText size={24} />
          <span className="text-[10px] mt-1">Invoices</span>
        </Link>
      </div>
    </nav>
  )
}

