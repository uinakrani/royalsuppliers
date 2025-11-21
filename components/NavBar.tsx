'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package, FileText, Wallet } from 'lucide-react'
import { createRipple } from '@/lib/rippleEffect'

export default function NavBar() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', icon: Home, label: 'Dashboard' },
    { href: '/orders', icon: Package, label: 'Orders' },
    { href: '/ledger', icon: Wallet, label: 'Ledger' },
    { href: '/invoices', icon: FileText, label: 'Invoices' },
  ]

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center"
      style={{ 
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.75rem)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 0.75rem)',
        pointerEvents: 'none',
      }}
    >
      <div 
        className="bg-white/95 backdrop-blur-xl rounded-t-3xl border-t border-gray-200/60 flex justify-around items-center w-full"
        style={{ 
          height: '4rem',
          minHeight: '4rem',
          boxShadow: '0 -2px 16px rgba(0, 0, 0, 0.06), 0 -1px 4px rgba(0, 0, 0, 0.03)',
          pointerEvents: 'auto',
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center flex-1 h-full relative touch-manipulation"
              style={{
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '4rem',
                padding: '0.5rem 0.25rem',
                cursor: 'pointer',
                transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)'
                createRipple(e)
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)'
                createRipple(e as any)
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
              onClick={(e) => {
                createRipple(e)
              }}
            >
              {/* Rounded icon container */}
              <div
                className="flex items-center justify-center rounded-full transition-all duration-200 ease-out"
                style={{
                  width: '40px',
                  height: '40px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <Icon 
                  size={20} 
                  className={`transition-all duration-200 ${
                    isActive ? 'text-primary-600' : 'text-gray-500'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              
              {/* Label */}
              <span 
                className={`text-[10px] mt-1 font-medium transition-all duration-200 ${
                  isActive ? 'text-primary-600' : 'text-gray-500'
                }`}
                style={{
                  lineHeight: '1.2',
                  marginTop: '0.25rem',
                }}
              >
                {item.label}
              </span>
              
              {/* Active indicator - bottom bar */}
              {isActive && (
                <div
                  className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-primary-600 rounded-full"
                />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

