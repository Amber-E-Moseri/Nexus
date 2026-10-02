import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, AlertCircle, Crown, Search } from 'lucide-react'
import { getGroupSpaceMembers, addGroupSpaceMember, removeGroupSpaceMember, getMySpaces, transferGroupSpaceOwnership } from '../lib/spaces'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ member, size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: member.avatar_color ?? '#5B34C7',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.3,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {getInitials(member.name ?? member.email)}
    </div>
  )
}

export default function GroupSpaceMembersPanel({ groupSpaceId, canTransferOwnership, onOwnershipTransferred }) {
  const { profile, role } = useAuth()
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedUserName, setSelectedUserName] = useState('')
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState('')
  const [selectedSpaceIds, setSelectedSpaceIds] = useState(new Set([groupSpaceId]))
  const [mySpaces, setMySpaces] = useState([])
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const pickerRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [groupSpaceId])

  useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [membersData, spacesData] = await Promise.all([
        getGroupSpaceMembers(groupSpaceId),
        canTransferOwnership ? getMySpaces(profile?.id, role, profile?.department_id) : Promise.resolve([]),
      ])

      setMembers(membersData)

      if (canTransferOwnership) {
        setMySpaces(spacesData.filter((s) => s.space_type === 'group'))
      }

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, avatar_color')
        .order('name')

      if (!usersError && users) {
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
      await Promise.all([...selectedSpaceIds].map((spaceId) => addGroupSpaceMember(spaceId, selectedUserId)))
      setSuccess(`Added to ${selectedSpaceIds.size} space${selectedSpaceIds.size > 1 ? 's' : ''}`)
      setSelectedUserId('')
      setSelectedUserName('')
      setPickerQuery('')
      setSelectedSpaceIds(new Set([groupSpaceId]))
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (!window.confirm('Remove this member from the group space?')) return

    setRemovingId(userId)
    setError('')

    try {
      await removeGroupSpaceMember(groupSpaceId, userId)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
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
      const newOwner = members.find((m) => m.id === selectedNewOwnerId)
      setSelectedNewOwnerId('')
      setSuccess(`Ownership transferred to ${newOwner?.name ?? newOwner?.email ?? 'new owner'}`)
      await loadData()
      onOwnershipTransferred?.(updatedSpace)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ownerCandidates = members.filter((m) => m.id !== profile?.id)

  const filteredUsers = allUsers.filter((u) => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return true
    return (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-tertiary)',
    marginBottom: 10,
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
        Loading members…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Members list card */}
      <div style={{ borderRadius: 24, border: '1px solid var(--border)', background: 'white', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={sectionLabel}>Members</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{members.length} {members.length === 1 ? 'member' : 'members'}</div>
          </div>
        </div>

        {error && (
          <div style={{ margin: '12px 20px', padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', color: '#B91C1C', fontSize: 13 }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ margin: '12px 20px', padding: '10px 14px', borderRadius: 10, background: '#F0FDF4', color: '#15803D', fontSize: 13 }}>
            {success}
          </div>
        )}

        <div>
          {members.map((member, idx) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 20px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar member={member} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name ?? member.email}
                    </div>
                    {member.role === 'owner' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: 'rgba(91,52,199,0.1)', color: '#5B34C7', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                        <Crown size={9} />
                        Owner
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.email}
                  </div>
                </div>
              </div>

              {canTransferOwnership && member.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={!!removingId}
                  title="Remove member"
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    borderRadius: 8,
                    background: 'transparent',
                    cursor: removingId ? 'default' : 'pointer',
                    color: removingId === member.id ? 'var(--text-tertiary)' : '#DC2626',
                    opacity: removingId && removingId !== member.id ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!removingId) e.currentTarget.style.background = '#FEF2F2' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}

          {members.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              No members yet.
            </div>
          )}
        </div>
      </div>

      {/* Add member + transfer ownership (owner/admin only) */}
      {canTransferOwnership && (
        <>
          {/* Add member */}
          <div style={{ borderRadius: 24, border: '1px solid var(--border)', background: 'white', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={sectionLabel}>Add Member</div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Typeahead picker */}
              <div ref={pickerRef} style={{ position: 'relative' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    background: 'var(--surface-tertiary)',
                    cursor: 'text',
                  }}
                  onClick={() => setPickerOpen(true)}
                >
                  <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  {selectedUserId ? (
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{selectedUserName}</span>
                  ) : (
                    <input
                      type="text"
                      value={pickerQuery}
                      onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true) }}
                      onFocus={() => setPickerOpen(true)}
                      placeholder="Search users…"
                      style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text-primary)' }}
                    />
                  )}
                  {selectedUserId && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedUserId(''); setSelectedUserName(''); setPickerQuery('') }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, lineHeight: 1 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {pickerOpen && !selectedUserId && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(28,22,16,0.12)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    zIndex: 20,
                  }}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>No users found</div>
                    ) : (
                      filteredUsers.slice(0, 40).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => { setSelectedUserId(user.id); setSelectedUserName(user.name ?? user.email); setPickerOpen(false); setPickerQuery('') }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-tint, #EDE8F8)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Avatar member={user} size={28} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{user.email}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Add to multiple spaces */}
              {mySpaces.length > 1 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                    Also add to
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--surface-secondary)', borderRadius: 10 }}>
                    {mySpaces.map((space) => (
                      <label key={space.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedSpaceIds.has(space.id)}
                          onChange={(e) => {
                            const next = new Set(selectedSpaceIds)
                            if (e.target.checked) { next.add(space.id) } else { next.delete(space.id) }
                            setSelectedSpaceIds(next)
                          }}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>{space.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleAddMember}
                disabled={!selectedUserId || saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '10px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !selectedUserId || saving ? 'default' : 'pointer',
                  opacity: !selectedUserId || saving ? 0.55 : 1,
                }}
              >
                <Plus size={14} />
                {saving ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </div>

          {/* Transfer ownership */}
          {ownerCandidates.length > 0 && (
            <div style={{ borderRadius: 24, border: '1px solid var(--border)', background: 'white', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={sectionLabel}>Transfer Ownership</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Pass ownership to another member. You'll remain in the group.
                </div>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select
                  value={selectedNewOwnerId}
                  onChange={(e) => setSelectedNewOwnerId(e.target.value)}
                  disabled={saving}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    background: 'var(--surface-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                >
                  <option value="">Select new owner…</option>
                  {ownerCandidates.map((m) => (
                    <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTransferOwnership}
                  disabled={!selectedNewOwnerId || saving}
                  style={{
                    width: '100%',
                    padding: '10px 18px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'white',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !selectedNewOwnerId || saving ? 'default' : 'pointer',
                    opacity: !selectedNewOwnerId || saving ? 0.55 : 1,
                  }}
                >
                  {saving ? 'Transferring…' : 'Transfer Ownership'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!canTransferOwnership && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px', borderRadius: 12, background: '#EFF6FF', color: '#1D4ED8', fontSize: 13 }}>
          <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          Only the group owner or a super admin can manage members and transfer ownership.
        </div>
      )}
    </div>
  )
}
