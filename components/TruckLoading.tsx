'use client'

import Image from 'next/image'
import { useState } from 'react'

interface TruckLoadingProps {
  size?: number
  className?: string
  text?: string
  inline?: boolean
}

export default function TruckLoading({ size = 200, className = '', text, inline = false }: TruckLoadingProps) {
  // Try to load GIF from public folder (no versioned querystring to match /public/truck-unloading.gif)
  const gifUrl = '/truck-unloading.gif'
  
  const [gifError, setGifError] = useState(false)
  
  if (inline) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div style={{ width: size, height: size, position: 'relative' }}>
          {!gifError ? (
            <Image
              src={gifUrl}
              alt="Loading..."
              fill
              sizes={`${size}px`}
              style={{
                objectFit: 'contain',
              }}
              onError={() => setGifError(true)}
            />
          ) : (
            <TruckUnloadingAnimation size={size} />
          )}
        </div>
        {text && <span className="text-sm text-gray-500">{text}</span>}
      </div>
    )
  }
  
  return (
    <div 
      className={`flex flex-col items-center justify-center gap-3 ${className}`} 
      style={{ 
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      <div 
        style={{ 
          width: size, 
          height: size, 
          position: 'relative', 
          maxWidth: '100%',
          display: 'block',
          margin: '0 auto'
        }}
      >
        {!gifError ? (
          <Image
            src={gifUrl}
            alt="Loading materials..."
            fill
            sizes={`${size}px`}
            style={{
              objectFit: 'contain',
            }}
            onError={() => setGifError(true)}
          />
        ) : (
          <TruckUnloadingAnimation size={size} />
        )}
      </div>
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}

// Animated SVG component as fallback
function TruckUnloadingAnimation({ size }: { size: number }) {
  const uniqueId = `truckGrad-${Math.random().toString(36).substr(2, 9)}`
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 200 150" 
      preserveAspectRatio="xMidYMid meet"
      style={{ 
        display: 'block',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <defs>
        <linearGradient id={uniqueId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#2e31fb', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#1e21d9', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      
      {/* Ground */}
      <line x1="0" y1="130" x2="200" y2="130" stroke="#666" strokeWidth="2" />
      
      {/* Truck body */}
      <rect 
        x="20" 
        y="80" 
        width="80" 
        height="40" 
        fill={`url(#${uniqueId})`} 
        rx="4"
        className="truck-animate"
      />
      
      {/* Truck cabin */}
      <rect 
        x="100" 
        y="70" 
        width="50" 
        height="50" 
        fill={`url(#${uniqueId})`} 
        rx="4"
        className="truck-animate"
      />
      
      {/* Truck window */}
      <rect 
        x="105" 
        y="75" 
        width="20" 
        height="15" 
        fill="#87CEEB" 
        rx="2"
        className="truck-animate"
      />
      
      {/* Wheels - outer */}
      <g className="truck-animate">
        <g transform="translate(45, 125)">
          <circle 
            r="12" 
            fill="#333"
            className="wheel-animate"
            style={{ transformOrigin: '0 0' }}
          />
          <circle 
            r="8" 
            fill="#666"
          />
        </g>
        <g transform="translate(75, 125)">
          <circle 
            r="12" 
            fill="#333"
            className="wheel-animate"
            style={{ transformOrigin: '0 0' }}
          />
          <circle 
            r="8" 
            fill="#666"
          />
        </g>
      </g>
      
      {/* Trolley container */}
      <rect 
        x="150" 
        y="90" 
        width="40" 
        height="30" 
        fill="#888" 
        rx="3"
        className="trolley-animate"
      />
      
      {/* Trolley wheels */}
      <g className="trolley-animate">
        <g transform="translate(160, 125)">
          <circle 
            r="6" 
            fill="#333"
            className="wheel-animate-fast"
            style={{ transformOrigin: '0 0' }}
          />
        </g>
        <g transform="translate(180, 125)">
          <circle 
            r="6" 
            fill="#333"
            className="wheel-animate-fast"
            style={{ transformOrigin: '0 0' }}
          />
        </g>
      </g>
      
      {/* Hydraulic lift arm */}
      <line 
        x1="100" 
        y1="100" 
        x2="150" 
        y2="105" 
        stroke="#555" 
        strokeWidth="3"
        className="arm-animate"
      />
    </svg>
  )
}

