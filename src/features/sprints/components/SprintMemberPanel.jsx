import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../notifications'
import Badge from '../../../components/ui/Badge'
import {
  addSprintMember,
  addPastorGroupToSprint,
  getActiveUsers,
  removeSprintMember,
  updateSprintMemberRole,
  updateSprintMemberTeams,
  reactivateTemporaryMember,
  getPendingSprintInvitations,
} from '../lib/sprints'
import { getSprintAccessRequests, approveSprintAccessRequest, rejectSprintAccessRequest } from '../../../lib/people/api'
import InviteExternalModal from './InviteExternalModal'

const ROLE_OPTIONS = ['owner', 'manager', 'contributor', 'viewer']

const TOKENS = {
  primary: '#4C2A92',
  accent: '#E8A020',
  border: '#EDE8DC',
  background: '#F4F1EA',
  textPrimary: '#2D2A22',
  textSecondary: '#7A6F5E',
  textTertiary: '#9E9488',
  surfaceTertiary: '#F2EEE6',
  cardShadow: '0 2px 6px rgba(28,22,16,0.08)',
}

const ROLE_COLORS = {
  owner: '#5B34C7',
  manager: '#1B72E8',
  contributor: '#E8A020',
  viewer: '#9E9488',
}

const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  contributor: 'Contributor',
  viewer: 'Viewer',
}

function selectedValuesFromOptions(options) {
  return Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value)
}

function MemberAvatar({ name, role }) {
  const initial = (name || '?')[0].toUpperCase()
  const color = ROLE_COLORS[role] || ROLE_COLORS.contributor
  return (
    <div
      style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: `${color}18`, color, border: `1.5px solid ${color}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, fontFamily: 'DM Sans, system-ui, sans-serif',
        userSelect: 'none',
      }}
    >
      {initial}
    </div>
  )
}

function RolePill({ role }) {
  const color = ROLE_COLORS[role] || ROLE_COLORS.contributor
  return (
    <span
      style={{
        fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 600,
        background: `${color}16`, color,
        border: `1px solid ${color}30`,
        whiteSpace: 'nowrap',
      }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: TOKENS.textTertiary, fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 500, color: TOKENS.textSecondary, marginBottom: 4 }}>{title}</div>
      <div>{subtitle}</div>
    </div>
  )
}

const selectStyle = {
  borderRadius: 10,
  border: `1px solid ${TOKENS.border}`,
  background: 'white',
  padding: '8px 12px',
  fontSize: 13,
  color: TOKENS.textPrimary,
  fontFamily: 'DM Sans, system-ui, sans-serif',
  cursor: 'pointer',
}

const smallBtnStyle = {
  borderRadius: 8,
  border: `1px solid ${TOKENS.border}`,
  background: 'white',
  padding: '7px 12px',
  fontSize: 12,
  color: TOKENS.textSecondary,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui, sans-serif',
  transition: 'background 0.12s',
  whiteSpace: 'nowrap',
}

export default function SprintMemberPanel({
  sprintId,
  sprintName,
  sprintEndDate,
  members,
  teams,
  canEdit,
  isArchived,
  onChanged,
}) {
  const { profile } = useAuth()
  const isMember = members.some((m) => m.user?.id === profile?.id)
  const isSuperAdmin = profile?.role === 'super_admin'
  const isPastor = profile?.role === 'pastor'

  const [orgUsers, setOrgUsers] = useState([])
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [accessRequests, setAccessRequests] = useState([])
  const [respondingRequestId, setRespondingRequestId] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('contributor')
  const [selectedTeamIds, setSelectedTeamIds] = useState([])
  const [selectedMembershipEndDate, setSelectedMembershipEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [reactivating, setReactivating] = useState(null)
  const [loadingPending, setLoadingPending] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const existingUserIds = useMemo(() => new Set(members.map((member) => member.user?.id)), [members])
  const pendingAccessRequests = useMemo(
    () => accessRequests.filter((request) => request.status === 'pending' && !existingUserIds.has(request.user_id)),
    [accessRequests, existingUserIds],
  )

  useEffect(() => {
    if (!isSuperAdmin || isArchived) return
    setLoadingUsers(true)
    getActiveUsers().then(setOrgUsers).catch(() => setOrgUsers([])).finally(() => setLoadingUsers(false))
  }, [isSuperAdmin, isArchived])

  useEffect(() => {
    setLoadingPending(true)
    getPendingSprintInvitations(sprintId)
      .then(setPendingInvitations)
      .catch(() => setPendingInvitations([]))
      .finally(() => setLoadingPending(false))
  }, [sprintId, onChanged])

  useEffect(() => {
    if (!canEdit || isArchived) return
    getSprintAccessRequests(sprintId)
      .then(setAccessRequests)
      .catch(() => setAccessRequests([]))
  }, [sprintId, canEdit, isArchived, onChanged])

  async function handleApproveRequest(request) {
    setRespondingRequestId(request.id)
    try {
      await approveSprintAccessRequest(request.id)
      setAccessRequests((prev) => prev.filter((r) => r.id !== request.id))
      await onChanged?.()
    } catch (err) {
      alert(`Error approving request: ${err.message}`)
    } finally {
      setRespondingRequestId(null)
    }
  }

  async function handleRejectRequest(request) {
    setRespondingRequestId(request.id)
    try {
      await rejectSprintAccessRequest(request.id)
      setAccessRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      alert(`Error rejecting request: ${err.message}`)
    } finally {
      setRespondingRequestId(null)
    }
  }

  async function handleAddGroup() {
    setAddingGroup(true)
    try {
      const added = await addPastorGroupToSprint(sprintId)
      await onChanged?.()
      if (added === 0) alert('All group members are already in this sprint.')
    } catch (err) {
      alert(`Error adding group members: ${err.message}`)
    } finally {
      setAddingGroup(false)
    }
  }

  const addableUsers = orgUsers.filter((user) => !existingUserIds.has(user.id))

  async function handleAdd() {
    if (!selectedUserId) return
    setSaving(true)
    try {
      await addSprintMember(sprintId, selectedUserId, selectedRole, selectedTeamIds, selectedMembershipEndDate || null)
      if (selectedUserId !== profile?.id) {
        await createNotification(selectedUserId, 'sprint_added', {
          sprint_id: sprintId,
          sprint_name: sprintName,
          added_by: profile?.name,
        })
      }
      setSelectedUserId('')
      setSelectedRole('contributor')
      setSelectedTeamIds([])
      setSelectedMembershipEndDate('')
      await onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(userId, role) {
    await updateSprintMemberRole(sprintId, userId, role)
    await onChanged?.()
  }

  async function handleTeamRoleChange(userId, teamId, role) {
    const { error } = await supabase
      .from('sprint_team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
    if (error) throw error
    await onChanged?.()
  }

  async function handleTeamChange(userId, teamIds) {
    await updateSprintMemberTeams(sprintId, userId, teamIds)
    await onChanged?.()
  }

  async function handleRemove(userId) {
    await removeSprintMember(sprintId, userId)
    await onChanged?.()
  }

  async function handleReactivate(userId) {
    try {
      setReactivating(userId)
      await reactivateTemporaryMember(userId)
      await onChanged?.()
      alert('Account reactivated successfully')
    } catch (err) {
      alert(`Error reactivating account: ${err.message}`)
    } finally {
      setReactivating(null)
    }
  }

  async function handleRemovePendingInvitation(userId) {
    if (!window.confirm('Cancel this invitation?')) return
    try {
      await removeSprintMember(sprintId, userId)
      setPendingInvitations((prev) => prev.filter((inv) => inv.user_id !== userId))
      await onChanged?.()
    } catch (err) {
      alert(`Error removing invitation: ${err.message}`)
    }
  }

  function daysUntilExpiration(endDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(`${endDate}T00:00:00`)
    end.setHours(0, 0, 0, 0)
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>

      {/* Access Requests */}
      {canEdit && pendingAccessRequests.length > 0 && (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TOKENS.textPrimary }}>Access Requests</div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginTop: 2 }}>People asking to join this sprint.</div>
            </div>
            <Badge tone="planning">{pendingAccessRequests.length} pending</Badge>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {pendingAccessRequests.map((request) => (
              <div
                key={request.id}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderRadius: 12, border: `1px solid ${TOKENS.border}`, background: TOKENS.surfaceTertiary, padding: '12px 14px' }}
              >
                <MemberAvatar name={request.user?.name} role="contributor" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {request.user?.name ?? request.user?.email ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textTertiary }}>
                    Requested {new Date(request.requested_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleApproveRequest(request)}
                  disabled={respondingRequestId === request.id}
                  style={{ ...smallBtnStyle, background: TOKENS.primary, color: 'white', border: 'none', fontWeight: 600, opacity: respondingRequestId === request.id ? 0.6 : 1, cursor: respondingRequestId === request.id ? 'not-allowed' : 'pointer' }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectRequest(request)}
                  disabled={respondingRequestId === request.id}
                  style={{ ...smallBtnStyle, opacity: respondingRequestId === request.id ? 0.6 : 1, cursor: respondingRequestId === request.id ? 'not-allowed' : 'pointer' }}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TOKENS.textPrimary }}>Pending Invitations</div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginTop: 2 }}>Awaiting acceptance from invited members.</div>
            </div>
            <Badge tone="planning">{pendingInvitations.length} pending</Badge>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.user_id}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderRadius: 12, border: `1px solid ${TOKENS.border}`, background: TOKENS.surfaceTertiary, padding: '12px 14px' }}
              >
                <MemberAvatar name={invitation.user?.name} role={invitation.role ?? 'contributor'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {invitation.user?.name ?? invitation.user?.email ?? '—'}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 7px', background: '#FEF3C7', color: '#92400E', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      Invited
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textTertiary, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {invitation.user?.email}
                  </div>
                </div>
                <RolePill role={invitation.role ?? 'contributor'} />
                {canEdit && !isArchived && (
                  <button
                    type="button"
                    onClick={() => handleRemovePendingInvitation(invitation.user_id)}
                    style={smallBtnStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.background }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, minWidth: 0, boxSizing: 'border-box', boxShadow: TOKENS.cardShadow }}>
        {/* Header */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: TOKENS.textPrimary }}>
              Sprint Members
              <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px', borderRadius: 999, background: TOKENS.surfaceTertiary, color: TOKENS.textSecondary, fontWeight: 500 }}>
                {members.length}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isPastor && isMember && !isArchived && (
              <button
                type="button"
                onClick={handleAddGroup}
                disabled={addingGroup}
                style={{ ...smallBtnStyle, background: TOKENS.accent, color: 'white', border: 'none', fontWeight: 600, opacity: addingGroup ? 0.7 : 1, cursor: addingGroup ? 'not-allowed' : 'pointer' }}
              >
                {addingGroup ? 'Adding…' : '+ Add my group'}
              </button>
            )}
            {(canEdit || isMember) && !isArchived && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                style={{ ...smallBtnStyle, background: TOKENS.primary, color: 'white', border: 'none', fontWeight: 600 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                + Invite external
              </button>
            )}
          </div>
        </div>

        {/* Member rows */}
        <div style={{ display: 'grid', gap: 8 }}>
          {members.map((member) => {
            const expiringMemberships = member.team_memberships?.filter(
              (m) => m.membership_end_date && new Date(m.membership_end_date) > new Date()
            ) ?? []
            const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.contributor

            return (
              <div
                key={member.user?.id}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${TOKENS.border}`,
                  borderLeft: `3px solid ${roleColor}`,
                  background: 'white',
                  padding: '12px 14px',
                  boxShadow: TOKENS.cardShadow,
                }}
              >
                {/* Top: avatar + identity */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <MemberAvatar name={member.user?.name} role={member.role} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: TOKENS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.user?.name ?? member.user?.email ?? '—'}
                      </span>
                      <RolePill role={member.role} />
                      {member.is_temporary && (
                        <span style={{ fontSize: 11, padding: '2px 7px', background: '#FFF2D9', color: '#C47E0A', borderRadius: 999 }}>Temp</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: TOKENS.textTertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.user?.email}
                    </div>
                    {/* Teams (read mode) */}
                    {!canEdit && member.sprint_teams?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {member.sprint_teams.map((team) => {
                          const teamRole = member.team_member_roles?.[team.id] || member.role || 'contributor'
                          const tColor = ROLE_COLORS[teamRole] || ROLE_COLORS.contributor
                          return (
                            <span key={team.id} style={{ fontSize: 11, padding: '2px 7px', background: `${tColor}12`, color: tColor, border: `1px solid ${tColor}28`, borderRadius: 6, fontWeight: 500 }}>
                              {team.name}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* Expiry */}
                    {member.is_temporary && member.membership_end_date && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#DC2626' }}>
                        Expires {new Date(`${member.membership_end_date}T00:00:00`).toLocaleDateString()}
                        {daysUntilExpiration(member.membership_end_date) <= 7 && (
                          <span style={{ marginLeft: 4, color: '#C47E0A' }}>({daysUntilExpiration(member.membership_end_date)}d)</span>
                        )}
                      </div>
                    )}
                    {expiringMemberships.length > 0 && !member.is_temporary && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#DC2626' }}>
                        Expires {expiringMemberships.map((m) => new Date(`${m.membership_end_date}T00:00:00`).toLocaleDateString()).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls row — always below info on any screen width */}
                {canEdit && !isArchived ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}`, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Sprint role */}
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                      style={{ ...selectStyle, padding: '5px 10px', fontSize: 12 }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    {/* Team assignment chips */}
                    {teams.map((team) => {
                      const assigned = (member.sprint_team_ids ?? []).includes(team.id)
                      return (
                        <button
                          key={team.id}
                          type="button"
                          title={assigned ? `Remove from ${team.name}` : `Add to ${team.name}`}
                          onClick={() => {
                            const cur = member.sprint_team_ids ?? []
                            handleTeamChange(member.user.id, assigned ? cur.filter((id) => id !== team.id) : [...cur, team.id])
                          }}
                          style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                            fontFamily: 'DM Sans, system-ui, sans-serif',
                            border: `1px solid ${assigned ? `${TOKENS.primary}50` : TOKENS.border}`,
                            background: assigned ? `${TOKENS.primary}10` : TOKENS.surfaceTertiary,
                            color: assigned ? TOKENS.primary : TOKENS.textTertiary,
                            fontWeight: assigned ? 600 : 400,
                          }}
                        >
                          {assigned ? '✓ ' : '+ '}{team.name}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => handleRemove(member.user.id)}
                      style={{ ...smallBtnStyle, color: '#C94830', borderColor: '#F5C6C0', marginLeft: 'auto' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                    >
                      Remove
                    </button>
                  </div>
                ) : member.is_temporary && member.user?.status === 'inactive' && profile?.role === 'super_admin' ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}` }}>
                    <button
                      type="button"
                      onClick={() => handleReactivate(member.user.id)}
                      disabled={reactivating === member.user.id}
                      style={{ ...smallBtnStyle, background: TOKENS.primary, color: 'white', border: 'none', opacity: reactivating === member.user.id ? 0.6 : 1 }}
                    >
                      {reactivating === member.user.id ? 'Reactivating…' : 'Reactivate'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}

          {members.length === 0 && (
            <EmptyState icon="👥" title="No members yet" subtitle="Invite team members to get started" />
          )}
        </div>
      </div>

      {/* Add Member Form — super_admin only */}
      {isSuperAdmin && !isArchived && (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600, color: TOKENS.textPrimary }}>Add member directly</div>
          {loadingUsers
            ? <div style={{ padding: '8px 0', color: TOKENS.textTertiary, fontSize: 13 }}>Loading users…</div>
            : null
          }
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ ...selectStyle, gridColumn: 'span 2' }}
              >
                <option value="">Select member to add…</option>
                {addableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} — {user.email}</option>
                ))}
              </select>

              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={selectStyle}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>

              {teams.length > 0 && (
                <select
                  multiple
                  value={selectedTeamIds}
                  onChange={(e) => setSelectedTeamIds(selectedValuesFromOptions(e.target.options))}
                  style={{ ...selectStyle, minHeight: 40 }}
                  title="Assign to team(s)"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              )}
            </div>

            {selectedTeamIds.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Membership expiration (optional)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={selectedMembershipEndDate}
                    onChange={(e) => setSelectedMembershipEndDate(e.target.value)}
                    style={selectStyle}
                  />
                  <span style={{ fontSize: 12, color: TOKENS.textTertiary }}>
                    {selectedMembershipEndDate ? 'Leave empty for permanent' : 'Permanent member'}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedUserId || saving}
              style={{
                borderRadius: 10, border: 'none',
                background: !selectedUserId || saving ? `${TOKENS.accent}80` : TOKENS.accent,
                padding: '10px 20px', fontSize: 13, fontWeight: 600, color: 'white',
                cursor: !selectedUserId || saving ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, system-ui, sans-serif',
                transition: 'opacity 0.12s',
                width: '100%',
              }}
            >
              {saving ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteExternalModal
          sprintId={sprintId}
          sprintEndDate={sprintEndDate}
          sprintName={sprintName}
          teams={teams}
          canInvite={Boolean((canEdit || isMember) && !isArchived)}
          canAssignPrivilegedRoles={Boolean(
            profile?.role === 'super_admin' ||
            members?.some((member) => member.user_id === profile?.id && member.role === 'owner')
          )}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => onChanged?.()}
        />
      )}
    </div>
  )
}
