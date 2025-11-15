import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: number
  className?: string
  text?: string
  inline?: boolean
}

export default function LoadingSpinner({ size = 24, className = '', text, inline = false }: LoadingSpinnerProps) {
  if (inline) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 size={size} className="animate-spin text-primary-600" />
        {text && <span className="text-sm text-gray-500">{text}</span>}
      </div>
    )
  }
  
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <Loader2 size={size} className="animate-spin text-primary-600" />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}

