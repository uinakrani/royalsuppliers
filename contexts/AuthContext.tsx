'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { onAuthStateChanged, updateProfile, User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getAuthInstance, loginWithGoogleSmart, logoutUser, handleRedirectResult, sendEmailLink, signInWithEmailLinkFromUrl } from '@/lib/authClient'
import { getDb, getFirebaseApp } from '@/lib/firebase'
import { workspaceService, Workspace } from '@/lib/workspaceService'
import { getActiveWorkspaceId, setActiveWorkspaceId, WORKSPACE_DEFAULTS } from '@/lib/workspaceSession'

type AuthContextType = {
  user: User | null
  loading: boolean
  redirecting: boolean
  redirectFailed: boolean
  clearRedirectFlag: () => void
  profilePhoto: string | null
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  login: () => Promise<void>
  loginWithEmail: (email: string) => Promise<{ success: boolean; method: string }>
  logout: () => Promise<void>
  setWorkspace: (id: string) => void
  createWorkspace: (name: string) => Promise<string | null>
  inviteToWorkspace: (email: string) => Promise<void>
  uploadProfileImage: (file: File) => Promise<string | null>
  deleteWorkspace: (id: string) => Promise<void>
  removeMember: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [redirectFailed, setRedirectFailed] = useState(false)
  const redirectCheckInFlight = useRef(false)

  const clearRedirectFlag = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rs-auth-redirect')
    }
    setRedirecting(false)
    setRedirectFailed(false)
  }, [])

  const shouldUseRedirect = useCallback(() => {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent || ''
    const isInApp = /FBAN|FBAV|Instagram|Line|Twitter|LinkedIn|WhatsApp|Snapchat|Pinterest/i.test(ua)
    // Prefer popup for regular Safari/PWA; only force redirect for embedded in-app browsers.
    return isInApp
  }, [])

  const bootstrapWorkspace = useCallback(
    (list: Workspace[]) => {
      const stored = getActiveWorkspaceId()
      const found = list.find((ws) => ws.id === stored)
      if (found) {
        setActiveWorkspaceIdState(found.id)
        setActiveWorkspaceId(found.id)
        return
      }
      if (list.length > 0) {
        setActiveWorkspaceIdState(list[0].id)
        setActiveWorkspaceId(list[0].id)
      } else {
        setActiveWorkspaceIdState(WORKSPACE_DEFAULTS.id)
        setActiveWorkspaceId(WORKSPACE_DEFAULTS.id)
      }
    },
    []
  )

  const processRedirectIfNeeded = useCallback(
    async (force = false) => {
      if (redirectCheckInFlight.current) return null
      const hasPendingRedirect =
        typeof window !== 'undefined' && localStorage.getItem('rs-auth-redirect') === '1'
      if (!force && !hasPendingRedirect) return null
      redirectCheckInFlight.current = true
      setRedirecting(true)
      try {
        const res = await handleRedirectResult()
        if (!res && typeof window !== 'undefined' && localStorage.getItem('rs-auth-redirect') === '1') {
          setRedirectFailed(true)
        }
        return res
      } catch (err) {
        console.warn('Redirect handling error', err)
        setRedirectFailed(true)
        return null
      } finally {
        setRedirecting(false)
        redirectCheckInFlight.current = false
      }
    },
    []
  )

  useEffect(() => {
    const auth = getAuthInstance()
    let unsub: (() => void) | undefined
    ;(async () => {
      setLoading(true)
      await processRedirectIfNeeded(true)

      // Check for custom magic link authentication first
      if (typeof window !== 'undefined') {
        const customUserData = localStorage.getItem('rs-auth-user')
        const authMethod = localStorage.getItem('rs-auth-method')
        const currentPath = window.location.pathname

        console.log('🔍 AuthContext init - checking for magic link:', {
          hasCustomUserData: !!customUserData,
          authMethod,
          currentPath,
          currentUser: !!user,
          timestamp: new Date().toISOString()
        })

        if (customUserData && authMethod === 'magic-link') {
          console.log('🔗 Found custom magic link authentication, setting user')
          try {
            const customUser = JSON.parse(customUserData)
            console.log('👤 Parsed user data:', {
              uid: customUser.uid,
              email: customUser.email,
              displayName: customUser.displayName
            })

            // Create a mock Firebase user object for compatibility
            const mockFirebaseUser = {
              ...customUser,
              getIdToken: () => Promise.resolve('magic-link-token'),
              getIdTokenResult: () => Promise.resolve({ claims: {} }),
            }
            setUser(mockFirebaseUser as User)
            console.log('✅ Magic link user set successfully')

            // Load workspaces for magic link user
            console.log('🏢 Loading workspaces for magic link user...')
            try {
              let userWorkspaces = await workspaceService.listForUser({
                uid: mockFirebaseUser.uid,
                email: mockFirebaseUser.email,
              })

              console.log('📋 Found workspaces for magic link user:', userWorkspaces.length)

              if (userWorkspaces.length === 0) {
                const fallbackName = `${mockFirebaseUser.displayName || 'My'} Workspace`
                console.log('📝 Creating fallback workspace for magic link user:', fallbackName)
                const createdId = await workspaceService.createWorkspace(fallbackName, {
                  uid: mockFirebaseUser.uid,
                  email: mockFirebaseUser.email
                })
                if (createdId) {
                  userWorkspaces = await workspaceService.listForUser({
                    uid: mockFirebaseUser.uid,
                    email: mockFirebaseUser.email
                  })
                  console.log('✅ Fallback workspace created for magic link user')
                }
              }

              setWorkspaces(userWorkspaces)
              bootstrapWorkspace(userWorkspaces)
              console.log('🏢 Workspaces loaded and set for magic link user')
            } catch (workspaceError) {
              console.error('❌ Failed to load workspaces for magic link user:', workspaceError)
              // Set empty workspaces as fallback
              setWorkspaces([])
            }

            // Don't set up Firebase listener for magic link users to prevent override
            console.log('🚫 Skipping Firebase auth listener for magic link user')
            setLoading(false)
            return
          } catch (parseError) {
            console.warn('❌ Failed to parse custom user data:', parseError)
            // Clean up invalid data
            localStorage.removeItem('rs-auth-user')
            localStorage.removeItem('rs-auth-method')
          }
        } else if (authMethod === 'magic-link' && !customUserData) {
          console.warn('⚠️ Magic link auth method set but no user data found')
          localStorage.removeItem('rs-auth-method')
        }
      }

      // If no magic link user was found, set up Firebase listener
      console.log('🔄 Setting up Firebase auth listener (no magic link user found)')

      // Fallback: Re-check for magic link data after a short delay
      setTimeout(async () => {
        if (typeof window !== 'undefined') {
          const fallbackUserData = localStorage.getItem('rs-auth-user')
          const fallbackAuthMethod = localStorage.getItem('rs-auth-method')

          if (fallbackUserData && fallbackAuthMethod === 'magic-link' && !user) {
            console.log('🔗 Fallback: Found magic link data, setting user')
            try {
              const fallbackUser = JSON.parse(fallbackUserData)
              const mockFirebaseUser = {
                ...fallbackUser,
                getIdToken: () => Promise.resolve('magic-link-token'),
                getIdTokenResult: () => Promise.resolve({ claims: {} }),
              }
              setUser(mockFirebaseUser as User)

              // Load workspaces for fallback magic link user
              console.log('🏢 Loading workspaces for fallback magic link user...')
              try {
                let userWorkspaces = await workspaceService.listForUser({
                  uid: mockFirebaseUser.uid,
                  email: mockFirebaseUser.email,
                })

                console.log('📋 Found workspaces for fallback magic link user:', userWorkspaces.length)

                if (userWorkspaces.length === 0) {
                  const fallbackName = `${mockFirebaseUser.displayName || 'My'} Workspace`
                  console.log('📝 Creating fallback workspace for fallback magic link user:', fallbackName)
                  const createdId = await workspaceService.createWorkspace(fallbackName, {
                    uid: mockFirebaseUser.uid,
                    email: mockFirebaseUser.email
                  })
                  if (createdId) {
                    userWorkspaces = await workspaceService.listForUser({
                      uid: mockFirebaseUser.uid,
                      email: mockFirebaseUser.email
                    })
                    console.log('✅ Fallback workspace created for magic link user')
                  }
                }

                setWorkspaces(userWorkspaces)
                bootstrapWorkspace(userWorkspaces)
                console.log('🏢 Workspaces loaded and set for fallback magic link user')
              } catch (workspaceError) {
                console.error('❌ Failed to load workspaces for fallback magic link user:', workspaceError)
                // Set empty workspaces as fallback
                setWorkspaces([])
              }

              setLoading(false)
              console.log('✅ Fallback: Magic link user set successfully')
            } catch (error) {
              console.warn('❌ Fallback: Failed to parse magic link data:', error)
            }
          }
        }
      }, 1000)

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        console.log('🔥 Firebase auth state changed:', {
          hasFirebaseUser: !!firebaseUser,
          firebaseUserEmail: firebaseUser?.email,
          currentUser: !!user
        })

        setLoading(true)
        try {
          if (firebaseUser) {
            setUser(firebaseUser)
            let photoUrl = firebaseUser.photoURL || null
            if (typeof window !== 'undefined' && firebaseUser.email) {
              localStorage.setItem('rs-last-email', firebaseUser.email)
            }

            const db = getDb()
            if (db) {
              const userDoc = doc(db, 'users', firebaseUser.uid)
              const snap = await getDoc(userDoc)
              const now = new Date().toISOString()
              if (snap.exists()) {
                const data = snap.data() as any
                if (data.photoURL) {
                  photoUrl = data.photoURL
                }
                await setDoc(
                  userDoc,
                  {
                    lastLoginAt: now,
                    displayName: firebaseUser.displayName,
                    email: firebaseUser.email,
                    photoURL: photoUrl,
                  },
                  { merge: true }
                )
              } else {
                await setDoc(userDoc, {
                  displayName: firebaseUser.displayName,
                  email: firebaseUser.email,
                  photoURL: photoUrl,
                  createdAt: now,
                  lastLoginAt: now,
                })
              }
            }

            // Ensure the default workspace exists for legacy data (owner only).
            if (firebaseUser.email && firebaseUser.email.toLowerCase() === WORKSPACE_DEFAULTS.ownerEmail.toLowerCase()) {
              await workspaceService.ensureDefaultWorkspace(firebaseUser.uid, firebaseUser.email || null)
            }

            let userWorkspaces = await workspaceService.listForUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
            })
            if (userWorkspaces.length === 0) {
              const fallbackName = `${firebaseUser.displayName || 'My'} Workspace`
              const createdId = await workspaceService.createWorkspace(fallbackName, { uid: firebaseUser.uid, email: firebaseUser.email })
              if (createdId) {
                userWorkspaces = await workspaceService.listForUser({ uid: firebaseUser.uid, email: firebaseUser.email })
              }
            }
            setWorkspaces(userWorkspaces)
            bootstrapWorkspace(userWorkspaces)
            setProfilePhoto(photoUrl)
          } else {
            setUser(null)
            setProfilePhoto(null)
            setWorkspaces([])
            setActiveWorkspaceIdState(null)
          }
        } finally {
          setLoading(false)
          setRedirecting(false)
          if (typeof window !== 'undefined') {
            localStorage.removeItem('rs-auth-redirect')
          }
        }
      })
    })()

    return () => {
      if (unsub) unsub()
    }
  }, [bootstrapWorkspace, processRedirectIfNeeded])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tryHandleRedirect = () => {
      if (document.visibilityState === 'visible') {
        processRedirectIfNeeded()
      }
    }
    window.addEventListener('focus', tryHandleRedirect)
    document.addEventListener('visibilitychange', tryHandleRedirect)
    return () => {
      window.removeEventListener('focus', tryHandleRedirect)
      document.removeEventListener('visibilitychange', tryHandleRedirect)
    }
  }, [processRedirectIfNeeded])

  const login = useCallback(async () => {
    setRedirectFailed(false)
    const useRedirect = shouldUseRedirect()
    const lastEmail = typeof window !== 'undefined' ? localStorage.getItem('rs-last-email') : undefined
    let fallbackTimer: any
    try {
      if (useRedirect) setRedirecting(true)
      await loginWithGoogleSmart(useRedirect, lastEmail || undefined)

      if (useRedirect && typeof window !== 'undefined') {
        fallbackTimer = setTimeout(async () => {
          if (document.visibilityState === 'visible' && localStorage.getItem('rs-auth-redirect') === '1') {
            try {
              await loginWithGoogleSmart(false, lastEmail || undefined)
              setRedirecting(false)
            } catch (err) {
              setRedirecting(false)
              setRedirectFailed(true)
            }
          }
        }, 3500)
      }
    } catch (err) {
      setRedirecting(false)
      setRedirectFailed(true)
      throw err
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer)
    }
  }, [shouldUseRedirect])

  const loginWithEmail = useCallback(async (email: string) => {
    try {
      return await sendEmailLink(email)
    } catch (err) {
      console.error('Email link send error:', err)
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutUser()
    setUser(null)
    setProfilePhoto(null)
    setWorkspaces([])
    setActiveWorkspaceIdState(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('activeWorkspaceId')
      // Clean up custom magic link data
      window.localStorage.removeItem('rs-auth-user')
      window.localStorage.removeItem('rs-auth-method')
    }
  }, [])

  const setWorkspace = useCallback((id: string) => {
    setActiveWorkspaceIdState(id)
    setActiveWorkspaceId(id)
  }, [])

  const createWorkspace = useCallback(
    async (name: string) => {
      if (!user) return null
      const id = await workspaceService.createWorkspace(name, { uid: user.uid, email: user.email })
      const updated = await workspaceService.listForUser({ uid: user.uid, email: user.email })
      setWorkspaces(updated)
      setWorkspace(id)
      return id
    },
    [user, setWorkspace]
  )

  const inviteToWorkspace = useCallback(
    async (email: string) => {
      if (!activeWorkspaceId) throw new Error('No active workspace')
      await workspaceService.inviteMember(activeWorkspaceId, email)
      if (user) {
        const refreshed = await workspaceService.listForUser({ uid: user.uid, email: user.email })
        setWorkspaces(refreshed)
      }
    },
    [activeWorkspaceId, user]
  )

  const uploadProfileImage = useCallback(
    async (file: File) => {
      if (!user) return null
      const app = getFirebaseApp()
      if (!app) throw new Error('Firebase app not initialized')
      const storage = getStorage(app)
      const path = `profiles/${user.uid}/${Date.now()}-${file.name}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      const auth = getAuthInstance()
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url })
      }

      const db = getDb()
      if (db) {
        await setDoc(
          doc(db, 'users', user.uid),
          { photoURL: url, updatedAt: new Date().toISOString() },
          { merge: true }
        )
      }

      setProfilePhoto(url)
      return url
    },
    [user]
  )

  const deleteWorkspace = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      await workspaceService.deleteWorkspace(id, { uid: user.uid })
      const refreshed = await workspaceService.listForUser({ uid: user.uid, email: user.email })
      setWorkspaces(refreshed)

      if (activeWorkspaceId === id) {
        const next = refreshed[0]
        if (next) {
          setWorkspace(next.id)
        } else {
          setActiveWorkspaceIdState(WORKSPACE_DEFAULTS.id)
          setActiveWorkspaceId(WORKSPACE_DEFAULTS.id)
        }
      }
    },
    [user, activeWorkspaceId, setWorkspace]
  )

  const removeMember = useCallback(
    async (email: string) => {
      if (!user) throw new Error('Not authenticated')
      if (!activeWorkspaceId) throw new Error('No active workspace')
      await workspaceService.removeMember(activeWorkspaceId, email, { uid: user.uid })
      const refreshed = await workspaceService.listForUser({ uid: user.uid, email: user.email })
      setWorkspaces(refreshed)
    },
    [user, activeWorkspaceId]
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      redirecting,
      redirectFailed,
      profilePhoto,
      workspaces,
      activeWorkspaceId,
      login,
      loginWithEmail,
      logout,
      setWorkspace,
      createWorkspace,
      inviteToWorkspace,
      uploadProfileImage,
      deleteWorkspace,
      removeMember,
      clearRedirectFlag,
    }),
    [user, loading, redirecting, redirectFailed, profilePhoto, workspaces, activeWorkspaceId, login, loginWithEmail, logout, setWorkspace, createWorkspace, inviteToWorkspace, uploadProfileImage, deleteWorkspace, removeMember, clearRedirectFlag]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

