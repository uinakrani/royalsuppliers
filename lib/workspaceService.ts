'use client'

import { addDoc, arrayUnion, arrayRemove, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { getDb } from './firebase'
import { WORKSPACE_DEFAULTS } from './workspaceSession'

export interface Workspace {
  id: string
  name: string
  ownerId: string
  ownerEmail: string
  memberEmails: string[]
  memberPhoneNumbers?: string[]
  createdAt: string
}

export const workspaceService = {
  async ensureDefaultWorkspace(ownerId: string | null, ownerEmail: string | null): Promise<Workspace | null> {
    const db = getDb()
    if (!db) return null

    const defaultDocRef = doc(db, 'workspaces', WORKSPACE_DEFAULTS.id)
    const snap = await getDoc(defaultDocRef)

    if (!snap.exists()) {
      const now = new Date().toISOString()
      const workspace: Workspace = {
        id: WORKSPACE_DEFAULTS.id,
        name: WORKSPACE_DEFAULTS.name,
        ownerId: ownerId || 'unknown-owner',
        ownerEmail: WORKSPACE_DEFAULTS.ownerEmail,
        memberEmails: [WORKSPACE_DEFAULTS.ownerEmail],
        createdAt: now,
      }
      await setDoc(defaultDocRef, workspace)
      return workspace
    }

    const data = snap.data() as Workspace
    return { ...data, id: snap.id }
  },

  async listForUser(user: { uid: string; email: string | null; phoneNumber?: string | null }): Promise<Workspace[]> {
    const db = getDb()
    if (!db) return []

    const workspaces: Workspace[] = []
    const ownedQuery = query(collection(db, 'workspaces'), where('ownerId', '==', user.uid))

    // Alias Logic: Map phone numbers to emails
    let searchEmail = user.email
    if (!searchEmail && user.phoneNumber) {
      if (user.phoneNumber === '+918980412337') {
        searchEmail = 'ashish.nakrani.60@gmail.com'
      } else if (user.phoneNumber === '+918905937070') {
        searchEmail = 'vivekbalar143@gmail.com'
      }
    }

    const memberQuery = searchEmail
      ? query(collection(db, 'workspaces'), where('memberEmails', 'array-contains', searchEmail))
      : null

    const phoneMemberQuery = user.phoneNumber
      ? query(collection(db, 'workspaces'), where('memberPhoneNumbers', 'array-contains', user.phoneNumber))
      : null

    const [ownedSnap, memberSnap] = await Promise.all([
      getDocs(ownedQuery),
      memberQuery ? getDocs(memberQuery) : Promise.resolve(null),
    ])

    ownedSnap.forEach((docSnap) => {
      const data = docSnap.data() as Workspace
      workspaces.push({ ...data, id: docSnap.id })
    })

    if (memberSnap) {
      memberSnap.forEach((docSnap) => {
        const data = docSnap.data() as Workspace
        const ws = { ...data, id: docSnap.id } as Workspace
        if (!workspaces.find((w) => w.id === ws.id)) {
          workspaces.push(ws)
        }
      })
    }

    // Add workspaces found by phone number
    const [phoneSnap] = await Promise.all([
      phoneMemberQuery ? getDocs(phoneMemberQuery) : Promise.resolve(null)
    ])

    if (phoneSnap) {
      phoneSnap.forEach((docSnap) => {
        const data = docSnap.data() as Workspace
        const ws = { ...data, id: docSnap.id } as Workspace
        if (!workspaces.find((w) => w.id === ws.id)) {
          workspaces.push(ws)
        }
      })
    }

    // If nothing found, fall back to default workspace only for the owner email.
    if (workspaces.length === 0 && searchEmail && searchEmail.toLowerCase() === WORKSPACE_DEFAULTS.ownerEmail.toLowerCase()) {
      // Create/Ensure default workspace with the ALIASED email if applicable
      const defaultWs = await this.ensureDefaultWorkspace(user.uid, searchEmail)
      if (defaultWs) workspaces.push(defaultWs)
    }

    return workspaces
  },

  async createWorkspace(name: string, user: { uid: string; email: string | null }): Promise<string> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')
    const now = new Date().toISOString()
    const docRef = await addDoc(collection(db, 'workspaces'), {
      name: name.trim(),
      ownerId: user.uid,
      ownerEmail: user.email || '',
      memberEmails: user.email ? [user.email] : [],
      memberPhoneNumbers: [], // Initialize empty
      createdAt: now,
    })
    return docRef.id
  },

  async inviteMember(workspaceId: string, identifier: string): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')
    const ref = doc(db, 'workspaces', workspaceId)

    const isEmail = identifier.includes('@')

    if (isEmail) {
      await updateDoc(ref, {
        memberEmails: arrayUnion(identifier.trim().toLowerCase()),
      })
    } else {
      // Assume phone number
      await updateDoc(ref, {
        memberPhoneNumbers: arrayUnion(identifier.trim()),
      })
    }
  },

  async removeMember(workspaceId: string, identifier: string, user: { uid: string }): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')
    const ref = doc(db, 'workspaces', workspaceId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Workspace not found')
    const data = snap.data() as Workspace
    if (data.ownerId !== user.uid) throw new Error('Only the workspace owner can remove members')

    if (data.ownerEmail?.toLowerCase() === identifier.trim().toLowerCase()) {
      throw new Error('Owner cannot be removed')
    }

    const isEmail = identifier.includes('@')

    if (isEmail) {
      await updateDoc(ref, {
        memberEmails: arrayRemove(identifier.trim().toLowerCase()),
      })
    } else {
      await updateDoc(ref, {
        memberPhoneNumbers: arrayRemove(identifier.trim()),
      })
    }
  },

  async deleteWorkspace(workspaceId: string, user: { uid: string }): Promise<void> {
    if (workspaceId === WORKSPACE_DEFAULTS.id) {
      throw new Error('Default workspace cannot be deleted')
    }

    const db = getDb()
    if (!db) throw new Error('Firestore not ready')

    const wsRef = doc(db, 'workspaces', workspaceId)
    const snap = await getDoc(wsRef)
    if (!snap.exists()) {
      throw new Error('Workspace not found')
    }

    const data = snap.data() as Workspace
    if (data.ownerId !== user.uid) {
      throw new Error('Only the workspace owner can delete this workspace')
    }

    await updateDoc(wsRef, { deletedAt: new Date().toISOString() }).catch(() => { })
    await setDoc(wsRef, { deleted: true }, { merge: true })
    await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(wsRef))
  },

  async renameWorkspace(workspaceId: string, newName: string, user: { uid: string }): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')

    const wsRef = doc(db, 'workspaces', workspaceId)
    const snap = await getDoc(wsRef)

    if (!snap.exists()) throw new Error('Workspace not found')

    const data = snap.data() as Workspace
    if (data.ownerId !== user.uid) {
      throw new Error('Only the workspace owner can rename this workspace')
    }

    if (!newName.trim()) {
      throw new Error('Workspace name cannot be empty')
    }

    await updateDoc(wsRef, {
      name: newName.trim(),
      updatedAt: new Date().toISOString()
    })
  },
}

