'use client'

import { FormEvent, useRef, useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import AuthGate from '@/components/AuthGate'
import { LogOut, Plus, Send, Building2, Upload, CheckCircle, Trash2, AlertTriangle, Users, Edit2 } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { showToast } from '@/components/Toast'


import { partnerService } from '@/lib/partnerService'
import { Partner } from '@/types/partner'

export default function AccountPage() {
  const { user, profilePhoto, logout, workspaces, activeWorkspaceId, setWorkspace, createWorkspace, inviteToWorkspace, uploadProfileImage, deleteWorkspace, renameWorkspace, removeMember, updateWorkspaceIcon } = useAuth()
  const [inviteIdentifier, setInviteIdentifier] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Partner State
  const [partners, setPartners] = useState<Partner[]>([])
  const [showPartnerModal, setShowPartnerModal] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  const [partnerPercentage, setPartnerPercentage] = useState('')

  // Rename State
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [workspaceToRename, setWorkspaceToRename] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Icon Upload State
  const workspaceIconInputRef = useRef<HTMLInputElement | null>(null)
  const [workspaceToUpdateIcon, setWorkspaceToUpdateIcon] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeWorkspace = useMemo(() => workspaces.find((ws) => ws.id === activeWorkspaceId), [workspaces, activeWorkspaceId])

  // Fetch partners when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      loadPartners()
    } else {
      setPartners([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId])

  const loadPartners = async () => {
    if (!activeWorkspaceId) return
    try {
      const data = await partnerService.getPartners(activeWorkspaceId)
      setPartners(data)
    } catch (error) {
      console.error('Failed to load partners:', error)
      showToast('Failed to load partners', 'error')
    }
  }

  const handleAddPartner = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeWorkspaceId) return
    if (!partnerName.trim() || !partnerPercentage) return

    setIsSaving(true)
    try {
      const newPartner: Partner = {
        name: partnerName.trim(),
        percentage: parseFloat(partnerPercentage),
        workspaceId: activeWorkspaceId
      }
      await partnerService.addPartner(newPartner)
      showToast('Partner added successfully', 'success')
      setPartnerName('')
      setPartnerPercentage('')
      setShowPartnerModal(false)
      loadPartners()
    } catch (error) {
      console.error(error)
      showToast('Failed to add partner', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemovePartner = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this partner?')) return
    try {
      await partnerService.deletePartner(id)
      showToast('Partner removed', 'success')
      loadPartners()
    } catch (error) {
      showToast('Failed to remove partner', 'error')
    }
  }

  const isInviteValid = useMemo(() => {
    const val = inviteIdentifier.trim()
    if (!val) return false
    // Check if email
    if (val.includes('@')) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    }
    // Check if phone (must start with +91)
    return val.startsWith('+91') && val.length >= 13
  }, [inviteIdentifier])

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

  const handleRemoveMember = async (identifier: string) => {
    const confirmed = window.confirm('Remove this member from the workspace?')
    if (!confirmed) return
    try {
      await removeMember(identifier)
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
    if (!isInviteValid) {
      showToast('Enter a valid phone number or email', 'error')
      return
    }
    setIsSaving(true)
    try {
      await inviteToWorkspace(inviteIdentifier.trim())
      showToast('Invitation sent', 'success')
      setInviteIdentifier('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to send invite', 'error')
    } finally {
      setIsSaving(false)
    }
  }



  const openRenameModal = (id: string, currentName: string) => {
    setWorkspaceToRename(id)
    setRenameValue(currentName)
    setShowRenameModal(true)
  }

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!workspaceToRename || !renameValue.trim()) return

    setIsSaving(true)
    try {
      await renameWorkspace(workspaceToRename, renameValue.trim())
      showToast('Workspace renamed', 'success')
      setShowRenameModal(false)
      setWorkspaceToRename(null)
      setRenameValue('')
    } catch (err: any) {
      showToast(err?.message || 'Failed to rename workspace', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleInviteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    // If user starts typing a number and it doesn't start with +, add +91
    if (/^\d/.test(val) && !val.startsWith('+')) {
      val = '+91' + val
    }
    setInviteIdentifier(val)
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

  const onWorkspaceIconUpload = async (file: File) => {
    if (!workspaceToUpdateIcon) return
    setIsSaving(true)
    try {
      await updateWorkspaceIcon(workspaceToUpdateIcon, file)
      showToast('Workspace icon updated', 'success')
      setWorkspaceToUpdateIcon(null)
    } catch (err: any) {
      showToast(err?.message || 'Failed to update workspace icon', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AuthGate>
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-primary-50 via-white to-gray-50 text-gray-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(46,49,251,0.08),_transparent_40%),_radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.12),_transparent_35%)]" />

        <header className="relative z-10 bg-gradient-to-b from-primary-600 via-primary-600 to-primary-500 px-4 pb-6 pt-safe text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-primary-100/80">Account</p>
              <h1 className="text-xl font-semibold leading-tight">{user.displayName || 'Your account'}</h1>
              <p className="text-sm text-primary-100/90">{user.email || user.phoneNumber}</p>
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
                      {(user.email || user.phoneNumber || '?')[0]?.toUpperCase()}
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
                <p className="text-sm text-gray-600">{user.email || user.phoneNumber}</p>
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
                const isOwner = !!ws.currentUserIsOwner
                const isDefault = ws.id === 'royal-construction'
                const isActive = ws.id === activeWorkspaceId
                return (
                  <div
                    key={ws.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${isActive
                      ? 'border-primary-200 bg-primary-50/70 text-primary-900 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-primary-100 hover:bg-primary-50/40'
                      }`}
                  >
                    <button
                      onClick={() => setWorkspace(ws.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative h-6 w-6 overflow-hidden rounded-md border border-gray-200">
                          {ws.iconUrl ? (
                            <Image src={ws.iconUrl} alt="WS" width={24} height={24} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gray-100 text-[10px] font-bold text-gray-400">
                              {ws.name[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="font-semibold">{ws.name}</div>
                        {isActive && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-primary-700 shadow">Active</span>}
                      </div>
                      <div className="text-[12px] text-gray-500">Owner: {ws.ownerEmail || 'unknown'}</div>
                    </button>
                    {isOwner && (
                      <>
                        <button
                          onClick={() => {
                            setWorkspaceToUpdateIcon(ws.id)
                            workspaceIconInputRef.current?.click()
                          }}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-600 transition hover:bg-gray-100"
                          title="Update Icon"
                        >
                          <Upload size={14} />
                        </button>
                        <button
                          onClick={() => openRenameModal(ws.id, ws.name)}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-600 transition hover:bg-gray-100"
                          title="Rename workspace"
                        >
                          <Edit2 size={14} />
                        </button>
                      </>
                    )}
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
              Invite Member
            </div>
            <form onSubmit={onInvite} className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
              <input
                type="text"
                required
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-200 focus:outline-none"
                placeholder="Phone number (+91...) or email"
                value={inviteIdentifier}
                onChange={handleInviteInputChange}
              />
              <button
                type="submit"
                disabled={isSaving || !isInviteValid}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-60"
              >
                <Send size={14} />
                Invite
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Invited members will see this workspace when they log in. Start with +91 for phones.
            </p>
          </section>


          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users size={18} className="text-primary-600" />
                Partners
              </div>
              <button
                onClick={() => setShowPartnerModal(true)}
                className="rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100 transition-colors"
                disabled={!activeWorkspaceId}
              >
                + Add Partner
              </button>
            </div>

            <div className="space-y-2">
              {partners.length > 0 ? (
                partners.map((partner) => (
                  <div key={partner.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                    <div>
                      <div className="font-medium text-gray-800">{partner.name}</div>
                      <div className="text-[11px] text-gray-500">{partner.percentage}% Share</div>
                    </div>
                    <button
                      onClick={() => handleRemovePartner(partner.id!)}
                      className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No partners added yet.</p>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Users size={18} className="text-primary-600" />
              Members
            </div>
            <div className="space-y-2">
              {activeWorkspace && (activeWorkspace.memberEmails?.length || activeWorkspace.memberPhoneNumbers?.length) ? (
                <>
                  {activeWorkspace.memberEmails?.map((m) => {
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
                  })}

                  {activeWorkspace.memberPhoneNumbers?.map((m) => {
                    const isOwner = activeWorkspace.ownerId === user?.uid
                    return (
                      <div key={m} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                        <div>
                          <div className="font-medium text-gray-800">{m}</div>
                        </div>
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveMember(m)}
                            className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
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

        {/* Add Partner Modal */}
        {showPartnerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Add Partner</h3>
              <form onSubmit={handleAddPartner} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Partner Name</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                    placeholder="Enter name"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Profit Share (%)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                    placeholder="20"
                    value={partnerPercentage}
                    onChange={(e) => setPartnerPercentage(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPartnerModal(false)}
                    className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 disabled:opacity-70 transition-all"
                  >
                    {isSaving ? 'Adding...' : 'Add Partner'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rename Workspace Modal */}
        {showRenameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Rename Workspace</h3>
              <form onSubmit={handleRenameSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Workspace Name</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
                    placeholder="Enter new name"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRenameModal(false)}
                    className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 disabled:opacity-70 transition-all"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}


        {/* Hidden Input for Workspace Icon */}
        <input
          ref={workspaceIconInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onWorkspaceIconUpload(file)
            // Reset value so same file can be selected again
            e.target.value = ''
          }}
        />
      </div>
    </AuthGate >
  )
}
