import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { getGroupSpaceMembers, addGroupSpaceMember, removeGroupSpaceMember, getMySpaces, transferGroupSpaceOwnership } from '../lib/spaces'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'

export default function GroupSpaceMembersPanel({ groupSpaceId, canTransferOwnership, onOwnershipTransferred }) {
  const { profile, role } = useAuth()
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState('')
  const [selectedSpaceIds, setSelectedSpaceIds] = useState(new Set([groupSpaceId]))
  const [mySpaces, setMySpaces] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadData()
  }, [groupSpaceId])

  async function loadData() {
    setLoading(true)
    try {
      const [membersData, spacesData] = await Promise.all([
        getGroupSpaceMembers(groupSpaceId),
        canTransferOwnership ? getMySpaces(profile?.id, role, profile?.department_id) : [],
      ])

      setMembers(membersData)

      if (canTransferOwnership) {
        // Filter to only group spaces
        const groupSpaces = spacesData.filter((s) => s.space_type === 'group')
        setMySpaces(groupSpaces)
      }

      // Fetch all users for the picker
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name')

      if (!usersError && users) {
        // Filter out already-members of the current space
        const memberIds = new Set(membersData.map((m) => m.id))
        setAllUsers(users.filter((u) => !memberIds.has(u.id)))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMember() {
    if (!selectedUserId) {
      setError('Please select a user')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Add to all selected spaces
      for (const spaceId of selectedSpaceIds) {
        await addGroupSpaceMember(spaceId, selectedUserId)
      }

      setSuccess(`Added to ${selectedSpaceIds.size} space${selectedSpaceIds.size > 1 ? 's' : ''}`)
      setSelectedUserId('')
      setSelectedSpaceIds(new Set([groupSpaceId]))
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (!window.confirm('Remove this member?')) return

    setSaving(true)
    setError('')

    try {
      await removeGroupSpaceMember(groupSpaceId, userId)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTransferOwnership() {
    if (!selectedNewOwnerId) {
      setError('Please select the new owner')
      return
    }

    if (!window.confirm('Transfer ownership of this group space? You will remain a member.')) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const updatedSpace = await transferGroupSpaceOwnership(groupSpaceId, selectedNewOwnerId)
      const newOwner = members.find((member) => member.id === selectedNewOwnerId)
      setSelectedNewOwnerId('')
      setSuccess(`Ownership transferred to ${newOwner?.name || newOwner?.email || 'the selected member'}`)
      await loadData()
      onOwnershipTransferred?.(updatedSpace)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ownerCandidates = members.filter((member) => member.id !== profile?.id)

  if (loading) {
    return <div className="p-4 text-center text-sm text-[var(--text-secondary)]">Loading members...</div>
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-white p-4">
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">👥 Members</h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Members list */}
      {members.length > 0 && (
        <div className="space-y-2 rounded-lg bg-[var(--surface-secondary)] p-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <span>{member.name || member.email}</span>
                  {member.role === 'owner' ? (
                    <span className="rounded-full bg-[rgba(91,52,199,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5B34C7]">
                      Owner
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">{member.email}</div>
              </div>
              {canTransferOwnership && member.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={saving}
                  className="rounded p-1 hover:bg-red-50"
                  title="Remove member"
                >
                  <Trash2 size={14} className="text-red-600" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {members.length === 0 && (
        <div className="rounded-lg bg-[var(--surface-secondary)] p-3 text-center text-sm text-[var(--text-secondary)]">
          No members yet (other than owner)
        </div>
      )}

      {/* Add member section - only for owner */}
      {canTransferOwnership && (
        <div className="space-y-3 rounded-lg border-t border-[var(--border)] pt-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Add member
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              disabled={saving}
            >
              <option value="">Select a user...</option>
              {allUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </div>

          {/* Add to multiple spaces */}
          {mySpaces.length > 1 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                Add to spaces
              </label>
              <div className="mt-2 space-y-1 rounded-lg bg-[var(--surface-secondary)] p-2">
                {mySpaces.map((space) => (
                  <label key={space.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSpaceIds.has(space.id)}
                      onChange={(e) => {
                        const next = new Set(selectedSpaceIds)
                        if (e.target.checked) {
                          next.add(space.id)
                        } else {
                          next.delete(space.id)
                        }
                        setSelectedSpaceIds(next)
                      }}
                      className="rounded"
                    />
                    <span className="text-[var(--text-primary)]">{space.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {selectedSpaceIds.size} space{selectedSpaceIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddMember}
            disabled={!selectedUserId || saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Plus size={14} />
            {saving ? 'Adding...' : 'Add member'}
          </button>

          {ownerCandidates.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Transfer ownership
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Choose an existing member to become the new owner of this group space.
                </p>
              </div>
              <select
                value={selectedNewOwnerId}
                onChange={(e) => setSelectedNewOwnerId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                disabled={saving}
              >
                <option value="">Select new owner...</option>
                {ownerCandidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={!selectedNewOwnerId || saving}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
              >
                {saving ? 'Transferring...' : 'Transfer ownership'}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {!canTransferOwnership && (
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <AlertCircle size={12} className="mb-1 inline" /> Only the group owner or a super admin can manage members
        </div>
      )}
    </div>
  )
}
