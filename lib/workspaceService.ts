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

  async listForUser(user: { uid: string; email: string | null }): Promise<Workspace[]> {
    const db = getDb()
    if (!db) return []

    const workspaces: Workspace[] = []
    const ownedQuery = query(collection(db, 'workspaces'), where('ownerId', '==', user.uid))
    const memberQuery = user.email
      ? query(collection(db, 'workspaces'), where('memberEmails', 'array-contains', user.email))
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

    // If nothing found, fall back to default workspace only for the owner email.
    if (workspaces.length === 0 && user.email && user.email.toLowerCase() === WORKSPACE_DEFAULTS.ownerEmail.toLowerCase()) {
      const defaultWs = await this.ensureDefaultWorkspace(user.uid, user.email)
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
      createdAt: now,
    })
    return docRef.id
  },

  async inviteMember(workspaceId: string, email: string): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')
    const ref = doc(db, 'workspaces', workspaceId)
    await updateDoc(ref, {
      memberEmails: arrayUnion(email.trim().toLowerCase()),
    })
  },

  async removeMember(workspaceId: string, email: string, user: { uid: string }): Promise<void> {
    const db = getDb()
    if (!db) throw new Error('Firestore not ready')
    const ref = doc(db, 'workspaces', workspaceId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Workspace not found')
    const data = snap.data() as Workspace
    if (data.ownerId !== user.uid) throw new Error('Only the workspace owner can remove members')
    if (data.ownerEmail?.toLowerCase() === email.trim().toLowerCase()) {
      throw new Error('Owner cannot be removed')
    }
    await updateDoc(ref, {
      memberEmails: arrayRemove(email.trim().toLowerCase()),
    })
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

    await updateDoc(wsRef, { deletedAt: new Date().toISOString() }).catch(() => {})
    await setDoc(wsRef, { deleted: true }, { merge: true })
    await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(wsRef))
  },
}

