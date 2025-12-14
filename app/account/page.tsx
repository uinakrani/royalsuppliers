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

  const activeWorkspace = useMemo(() => workspaces.find((ws) => ws.id === activeWorkspaceId), [workspaces, activeWorkspaceId])
  const isInviteEmailValid = useMemo(() => {
    const email = inviteEmail.trim()
    if (!email) return false
    // Simple RFC5322-like pattern for typical emails
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }, [inviteEmail])

  const handleWorkspaceDelete = async (workspaceId: string) => {
    const confirmed = window.confirm('Deleting this workspace may make its data inaccessible. Continue?')
    if (!confirmed) return
    try {
      await deleteWorkspace(workspaceId)
      showToast('Workspace deleted', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete workspace', 'error')
    }
  }

  const handleRemoveMember = async (email: string) => {
    const confirmed = window.confirm('Remove this member from the workspace?')
    if (!confirmed) return
    try {
      await removeMember(email)
      showToast('Member removed', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove member', 'error')
    }
  }

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
      <div className="relative flex min-h-screen flex-col bg-gradient-to-b from-primary-50 via-white to-gray-50 text-gray-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(46,49,251,0.08),_transparent_40%),_radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.12),_transparent_35%)]" />

        <header className="relative z-10 bg-gradient-to-b from-primary-600 via-primary-600 to-primary-500 px-4 pb-6 pt-safe text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-primary-100/80">Account</p>
              <h1 className="text-xl font-semibold leading-tight">{user.displayName || 'Your account'}</h1>
              <p className="text-sm text-primary-100/90">{user.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="relative z-10 -mt-6 flex-1 overflow-y-auto px-4 pb-28 pt-3 space-y-5">
          <section className="rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-14 w-14 overflow-hidden rounded-2xl border border-white shadow-md ring-2 ring-primary-100/70">
                  {profilePhoto ? (
                    <Image src={profilePhoto} alt="Profile" width={56} height={56} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-base font-semibold text-primary-700">
                      {user.email?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <button
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary-600 p-2 text-white shadow-md ring-2 ring-white transition hover:bg-primary-700"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload new photo"
                >
                  <Upload size={14} />
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
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500">Account</p>
                <h2 className="text-lg font-semibold text-gray-900 leading-tight">{user.displayName || 'Your account'}</h2>
                <p className="text-sm text-gray-600">{user.email}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full bg-primary-50 px-2 py-1 text-primary-700">{activeWorkspace?.name || 'No workspace selected'}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">{activeWorkspace?.memberEmails?.length ?? 0} members</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Building2 size={18} className="text-primary-600" />
                Workspaces
              </div>
              <span className="text-[11px] text-gray-500">Tap to switch</span>
            </div>
            <div className="space-y-2">
              {workspaces.map((ws) => {
                const isOwner = user?.uid === ws.ownerId
                const isDefault = ws.id === 'royal-construction'
                const isActive = ws.id === activeWorkspaceId
                return (
                  <div
                    key={ws.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                      isActive
                        ? 'border-primary-200 bg-primary-50/70 text-primary-900 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-primary-100 hover:bg-primary-50/40'
                    }`}
                  >
                    <button
                      onClick={() => setWorkspace(ws.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{ws.name}</div>
                        {isActive && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-primary-700 shadow">Active</span>}
                      </div>
                      <div className="text-[12px] text-gray-500">Owner: {ws.ownerEmail || 'unknown'}</div>
                    </button>
                    {isActive && <CheckCircle size={16} className="text-primary-600" />}
                    {isOwner && !isDefault && (
                      <button
                        onClick={() => handleWorkspaceDelete(ws.id)}
                        className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                        title="Delete workspace"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <form onSubmit={onCreateWorkspace} className="flex gap-2 rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-primary-100 bg-white px-3 py-2 text-sm focus:border-primary-300 focus:outline-none"
                placeholder="New workspace name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-60"
              >
                <Plus size={14} />
                Create
              </button>
            </form>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Send size={18} className="text-primary-600" />
              Invite by email
            </div>
            <form onSubmit={onInvite} className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
              <input
                type="email"
                required
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-200 focus:outline-none"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving || !isInviteEmailValid}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-60"
              >
                <Send size={14} />
                Send
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Invited members will see this workspace when they log in with the same email.
            </p>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Users size={18} className="text-primary-600" />
              Members
            </div>
            <div className="space-y-2">
              {activeWorkspace && activeWorkspace.memberEmails?.length ? (
                activeWorkspace.memberEmails.map((m) => {
                  const isOwnerEmail = activeWorkspace.ownerEmail?.toLowerCase() === m.toLowerCase()
                  const isOwner = activeWorkspace.ownerId === user?.uid
                  return (
                    <div key={m} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                      <div>
                        <div className="font-medium text-gray-800">{m}</div>
                        {isOwnerEmail && <div className="text-[11px] text-gray-500">Owner</div>}
                      </div>
                      {isOwner && !isOwnerEmail && (
                        <button
                          onClick={() => handleRemoveMember(m)}
                          className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-gray-500">No members to show.</p>
              )}
            </div>
            <p className="text-[11px] text-amber-700 flex items-center gap-1">
              <AlertTriangle size={14} />
              Only the owner can delete a workspace. The default Royal Construction workspace cannot be deleted.
            </p>
          </section>
        </main>

        <NavBar />
      </div>
    </AuthGate>
  )
}

