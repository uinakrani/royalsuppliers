'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package } from 'lucide-react'

export default function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe shadow-lg">
      <div className="flex justify-around items-center h-16">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <Home size={24} />
          <span className="text-xs mt-1">Dashboard</span>
        </Link>
        <Link
          href="/orders"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            pathname === '/orders' ? 'text-primary-600' : 'text-gray-500'
          }`}
        >
          <Package size={24} />
          <span className="text-xs mt-1">Orders</span>
        </Link>
      </div>
    </nav>
  )
}

