'use client'

// Central place to track which workspace is active for the current user.
// This is intentionally a lightweight module (no React) so it can be reused
// by services and utilities without causing circular dependencies.

const DEFAULT_WORKSPACE_ID = 'royal-construction'
const DEFAULT_WORKSPACE_NAME = 'Royal Construction'
const DEFAULT_WORKSPACE_OWNER_EMAIL = 'ashish.nakrani.60@gmail.com'

let activeWorkspaceId: string | null = null

export function getActiveWorkspaceId(): string {
  if (activeWorkspaceId) return activeWorkspaceId

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('activeWorkspaceId')
    if (stored) {
      activeWorkspaceId = stored
      return stored
    }
  }

  activeWorkspaceId = DEFAULT_WORKSPACE_ID
  return activeWorkspaceId
}

export function setActiveWorkspaceId(id: string) {
  activeWorkspaceId = id
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('activeWorkspaceId', id)
  }
}

export function matchesActiveWorkspace(item: { workspaceId?: string } | null | undefined): boolean {
  if (!item) return false
  const current = getActiveWorkspaceId()
  if (!item.workspaceId) {
    // Treat missing workspaceId as belonging to the default workspace so legacy
    // data remains visible for the original company.
    return current === DEFAULT_WORKSPACE_ID
  }
  return item.workspaceId === current
}

export function attachWorkspace<T extends Record<string, any>>(data: T): T & { workspaceId: string } {
  const workspaceId = getActiveWorkspaceId()
  return { ...data, workspaceId }
}

export const WORKSPACE_DEFAULTS = {
  id: DEFAULT_WORKSPACE_ID,
  name: DEFAULT_WORKSPACE_NAME,
  ownerEmail: DEFAULT_WORKSPACE_OWNER_EMAIL,
}

