'use client'

import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'relative inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 touch-manipulation overflow-hidden'
  
  const variantStyles = {
    primary: 'bg-gradient-to-r from-primary-600 to-primary-700 text-white active:from-primary-700 active:to-primary-800 active:scale-[0.97] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed',
    secondary: 'bg-gray-200 text-gray-700 active:bg-gray-300 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed',
    danger: 'bg-gradient-to-r from-red-600 to-red-700 text-white active:from-red-700 active:to-red-800 active:scale-[0.97] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed',
    ghost: 'bg-white text-gray-700 border border-gray-200/60 active:bg-gray-50 active:scale-[0.97] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
  }
  
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-5 py-3 text-base gap-2'
  }
  
  const widthStyle = fullWidth ? 'w-full' : ''
  
  const isDisabled = disabled || loading

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent', ...props.style }}
    >
      {/* Loading overlay with smooth fade-in */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-lg animate-fade-in z-10">
          <svg
            className="animate-spin text-current"
            style={{ width: size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px', height: size === 'sm' ? '16px' : size === 'md' ? '20px' : '24px' }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      
      {/* Content with fade-out when loading */}
      <span className={`inline-flex items-center justify-center gap-2 transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </span>
    </button>
  )
}

