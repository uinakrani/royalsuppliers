'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface PopupStackContextType {
  registerPopup: (id: string) => number // Returns z-index
  unregisterPopup: (id: string) => void
  getPopupCount: () => number
  isTopPopup: (id: string) => boolean
}

const PopupStackContext = createContext<PopupStackContextType | undefined>(undefined)

export function PopupStackProvider({ children }: { children: ReactNode }) {
  const [popupIds, setPopupIds] = useState<string[]>([])

  const registerPopup = useCallback((id: string): number => {
    setPopupIds(prev => {
      if (prev.includes(id)) {
        return prev // Already registered
      }
      return [...prev, id]
    })
    // Return z-index based on position in stack
    return 99999 + popupIds.length
  }, [popupIds.length])

  const unregisterPopup = useCallback((id: string) => {
    setPopupIds(prev => prev.filter(popupId => popupId !== id))
  }, [])

  const getPopupCount = useCallback(() => {
    return popupIds.length
  }, [popupIds.length])

  const isTopPopup = useCallback((id: string) => {
    return popupIds.length > 0 && popupIds[popupIds.length - 1] === id
  }, [popupIds])

  return (
    <PopupStackContext.Provider
      value={{
        registerPopup,
        unregisterPopup,
        getPopupCount,
        isTopPopup,
      }}
    >
      {children}
    </PopupStackContext.Provider>
  )
}

export function usePopupStack() {
  const context = useContext(PopupStackContext)
  if (context === undefined) {
    // Return a no-op implementation if context is not available
    return {
      registerPopup: () => 99999,
      unregisterPopup: () => {},
      getPopupCount: () => 0,
      isTopPopup: () => true,
    }
  }
  return context
}

