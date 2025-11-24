'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns'

interface DatePickerProps {
  value: string // ISO date string
  onChange: (value: string) => void
  onClose: () => void
  label?: string
}

export default function DatePicker({ 
  value, 
  onChange, 
  onClose, 
  label = 'Select Date'
}: DatePickerProps) {
  const selectedDate = value ? new Date(value) : new Date()
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
    onChange(date.toISOString().split('T')[0])
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
    onChange(today.toISOString().split('T')[0])
    onClose()
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[100000] flex items-end justify-center backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-white rounded-t-3xl w-full max-w-md animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
          <button
            onClick={onClose}
            className="p-2 active:bg-gray-100 rounded-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <button
            onClick={handlePrevMonth}
            className="p-2 active:bg-gray-100 rounded-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-lg font-semibold text-gray-900">
            {format(currentMonth, 'MMMM yyyy')}
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 active:bg-gray-100 rounded-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Calendar */}
        <div className="p-4">
          {/* Week Days Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
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
                  className={`aspect-square rounded-lg text-sm font-medium transition-all duration-100 ${
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
        <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleToday}
              className="w-full h-12 bg-primary-600 text-white rounded-xl font-semibold active:bg-primary-700 active:scale-[0.97] transition-transform duration-100 flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Calendar size={18} />
              Select Today
            </button>
        </div>
      </div>
    </div>
  )
}

