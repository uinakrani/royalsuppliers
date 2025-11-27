'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns'

// Helper function to format date as YYYY-MM-DD in local time (not UTC)
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper function to parse YYYY-MM-DD string to Date in local time
const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

interface DatePickerProps {
  value: string // ISO date string
  onChange: (value: string) => void
  onClose: () => void
  label?: string
  inline?: boolean // If true, render inline instead of as overlay
}

export default function DatePicker({ 
  value, 
  onChange, 
  onClose, 
  label = 'Select Date',
  inline = false
}: DatePickerProps) {
  // Parse date string in local time to avoid timezone issues
  const selectedDate = value ? parseLocalDate(value) : new Date()
  const [currentMonth, setCurrentMonth] = useState(selectedDate)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  
  // Get first day of week (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfWeek = getDay(monthStart)
  
  // Create array with empty cells for days before month starts
  const emptyDays = Array(firstDayOfWeek).fill(null)
  const allDays = [...emptyDays, ...daysInMonth]

  const handleDateSelect = (date: Date) => {
    onChange(formatLocalDate(date))
    onClose()
  }

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1))
  }

  const handleToday = () => {
    const today = new Date()
    onChange(formatLocalDate(today))
    onClose()
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const renderContent = () => {
    return (
      <div 
        className={inline ? "w-full" : "bg-white rounded-t-3xl w-full max-w-md animate-slide-up shadow-2xl"}
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
      {/* Header - Only show when not inline */}
      {!inline && (
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">{label}</h3>
          <button
            onClick={onClose}
            className="p-1.5 active:bg-gray-100 rounded-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>
      )}

      {/* Month Navigation */}
      <div className={`flex items-center justify-between ${inline ? 'p-2' : 'p-3'} ${inline ? '' : 'border-b border-gray-200'}`}>
        <button
          onClick={handlePrevMonth}
          className="p-1.5 active:bg-gray-100 rounded-lg"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <div className="text-base font-semibold text-gray-900">
          {format(currentMonth, 'MMMM yyyy')}
        </div>
        <button
          onClick={handleNextMonth}
          className="p-1.5 active:bg-gray-100 rounded-lg"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {/* Calendar */}
      <div className={inline ? "p-2" : "p-3"}>
        {/* Week Days Header */}
        <div className={`grid grid-cols-7 ${inline ? 'gap-0.5 mb-1' : 'gap-1 mb-1.5'}`}>
          {weekDays.map((day) => (
            <div key={day} className={`text-center ${inline ? 'text-[10px] py-1' : 'text-xs py-1.5'} font-medium text-gray-500`}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className={`grid grid-cols-7 ${inline ? 'gap-0.5' : 'gap-1'}`}>
          {allDays.map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="aspect-square" />
            }

            const isSelected = value && isSameDay(day, selectedDate)
            const isToday = isSameDay(day, new Date())
            const isCurrentMonth = isSameMonth(day, currentMonth)

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDateSelect(day)}
                className={`aspect-square ${inline ? 'rounded-md text-[11px]' : 'rounded-lg text-xs'} font-medium transition-all duration-100 ${
                  isSelected
                    ? 'bg-primary-600 text-white shadow-lg scale-110'
                    : isToday
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-500 active:scale-[0.95]'
                    : isCurrentMonth
                    ? 'bg-white text-gray-900 active:bg-gray-100 active:scale-[0.95]'
                    : 'bg-gray-50 text-gray-400'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Today Button */}
      <div className={inline ? "p-2 border-t border-gray-200" : "p-3 border-t border-gray-200"}>
          <button
            onClick={handleToday}
            className={inline ? "w-full h-9 bg-primary-600 text-white rounded-lg font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30 text-xs" : "w-full h-10 bg-primary-600 text-white rounded-lg font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30 text-sm"}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Calendar size={inline ? 14 : 16} />
            Select Today
          </button>
      </div>
    </div>
    )
  }

  if (inline) {
    return renderContent()
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[100000] flex items-end justify-center backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {renderContent()}
    </div>
  )
}

