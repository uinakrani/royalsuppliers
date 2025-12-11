'use client'

import { FormEvent, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import AuthGate from '@/components/AuthGate'
import { LogOut, Plus, Send, Building2, Upload, CheckCircle, Trash2, AlertTriangle, Users } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { showToast } from '@/components/Toast'

export default function AccountPage() {
  const { user, profilePhoto, logout, workspaces, activeWorkspaceId, setWorkspace, createWorkspace, inviteToWorkspace, uploadProfileImage, deleteWorkspace, removeMember } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isInviteEmailValid = useMemo(() => {
    const email = inviteEmail.trim()
    if (!email) return false
    // Simple RFC5322-like pattern for typical emails
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }, [inviteEmail])

  if (!user) {
    return (
      <AuthGate>
        <div />
      </AuthGate>
    )
  }

  const onInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!isInviteEmailValid) {
      showToast('Enter a valid email before inviting', 'error')
      return
    }
    setIsSaving(true)
    try {
      await inviteToWorkspace(inviteEmail.trim().toLowerCase())
      showToast('Invitation sent', 'success')
      setInviteEmail('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to send invite', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const onCreateWorkspace = async (e: FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return
    setIsSaving(true)
    try {
      await createWorkspace(newWorkspaceName.trim())
      showToast('Workspace created', 'success')
      setNewWorkspaceName('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to create workspace', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const onUpload = async (file: File) => {
    setIsSaving(true)
    try {
      await uploadProfileImage(file)
      showToast('Profile image updated', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to update image', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50 pb-24">
        <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Signed in as</div>
            <div className="font-semibold text-gray-900">{user.displayName || user.email}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
          </div>
          <button
            onClick={() => logout()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-sm"
          >
            <LogOut size={16} />
            Logout
          </button>
        </header>

        <main className="px-4 py-6 space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-gray-500 tracking-wide">Profile</div>
                <div className="font-semibold text-gray-900">Your account</div>
              </div>
              <div className="relative">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow">
                  {profilePhoto ? (
                    <Image src={profilePhoto} alt="Profile" width={64} height={64} className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-600">
                      {user.email?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <button
                  className="absolute -bottom-2 -right-2 bg-primary-600 text-white rounded-full p-2 shadow"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload new photo"
                >
                  <Upload size={16} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onUpload(file)
                  }}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="text-primary-600" size={18} />
              <div>
                <div className="text-xs uppercase text-gray-500 tracking-wide">Workspaces</div>
                <div className="font-semibold text-gray-900">Choose company workspace</div>
              </div>
            </div>
            <div className="space-y-2">
              {workspaces.map((ws) => {
                const isOwner = user?.uid === ws.ownerId
                const isDefault = ws.id === 'royal-construction'
                return (
                  <div
                    key={ws.id}
                    className={`w-full px-3 py-3 rounded-xl border flex items-center justify-between gap-3 ${
                      ws.id === activeWorkspaceId ? 'border-primary-200 bg-primary-50 text-primary-800' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => setWorkspace(ws.id)}
                      className="flex-1 text-left"
                    >
                      <div className="font-semibold">{ws.name}</div>
                      <div className="text-xs text-gray-500">Owner: {ws.ownerEmail || 'unknown'}</div>
                    </button>
                    {ws.id === activeWorkspaceId && <CheckCircle size={18} className="text-primary-600" />}
                    {isOwner && !isDefault && (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm('Deleting this workspace may make its data inaccessible. Continue?')
                          if (!confirmed) return
                          try {
                            await deleteWorkspace(ws.id)
                            showToast('Workspace deleted', 'success')
                          } catch (err: any) {
                            showToast(err?.message || 'Failed to delete workspace', 'error')
                          }
                        }}
                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete workspace"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <form onSubmit={onCreateWorkspace} className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                placeholder="New workspace name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm shadow hover:bg-primary-700 disabled:opacity-50"
              >
                <Plus size={16} />
                Create
              </button>
            </form>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="text-primary-600" size={18} />
              <div>
                <div className="text-xs uppercase text-gray-500 tracking-wide">Invite</div>
                <div className="font-semibold text-gray-900">Invite member by email</div>
              </div>
            </div>
            <form onSubmit={onInvite} className="flex gap-2">
              <input
                type="email"
                required
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving || !isInviteEmailValid}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm shadow hover:bg-primary-700 disabled:opacity-50"
              >
                <Send size={16} />
                Send
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Invited members will see this workspace when they log in with the same email.
            </p>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="text-primary-600" size={18} />
              <div>
                <div className="text-xs uppercase text-gray-500 tracking-wide">Members</div>
                <div className="font-semibold text-gray-900">Workspace members</div>
              </div>
            </div>
            <div className="space-y-2">
              {activeWorkspaceId && workspaces.length > 0 ? (
                workspaces
                  .find((ws) => ws.id === activeWorkspaceId)
                  ?.memberEmails?.map((m) => {
                    const workspace = workspaces.find((ws) => ws.id === activeWorkspaceId)
                    const isOwner = workspace?.ownerId === user?.uid
                    const isOwnerEmail = workspace?.ownerEmail?.toLowerCase() === m.toLowerCase()
                    return (
                      <div key={m} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-xl">
                        <div>
                          <div className="font-medium text-gray-800">{m}</div>
                          {isOwnerEmail && <div className="text-xs text-gray-500">Owner</div>}
                        </div>
                        {isOwner && !isOwnerEmail && (
                          <button
                            onClick={async () => {
                              const confirmed = window.confirm('Remove this member from the workspace?')
                              if (!confirmed) return
                              try {
                                await removeMember(m)
                                showToast('Member removed', 'success')
                              } catch (err: any) {
                                showToast(err?.message || 'Failed to remove member', 'error')
                              }
                            }}
                            className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })
              ) : (
                <p className="text-sm text-gray-500">No members to show.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle size={18} />
              <div className="font-semibold">Deleting a workspace</div>
            </div>
            <p className="text-sm text-gray-700">
              Only the owner can delete a workspace. Deleting may make its data inaccessible. The default Royal Construction workspace cannot be deleted.
            </p>
          </section>
        </main>

        <NavBar />
      </div>
    </AuthGate>
  )
}

