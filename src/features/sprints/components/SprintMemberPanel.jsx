import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createNotification } from '../../notifications'
import Badge from '../../../components/ui/Badge'
import {
  addSprintMember,
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
  cardShadow: '0 1px 3px rgba(28,22,16,0.05)',
}

function selectedValuesFromOptions(options) {
  return Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value)
}

function badgeColorForRole(role) {
  if (role === 'owner') return '#5B34C7'
  if (role === 'manager') return '#1B72E8'
  if (role === 'viewer') return '#9E9488'
  return '#E8A020'
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: TOKENS.textTertiary, fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 500, color: TOKENS.textSecondary, marginBottom: 4 }}>
        {title}
      </div>
      <div>{subtitle}</div>
    </div>
  )
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

  useEffect(() => {
    if (!canEdit || isArchived) return
    setLoadingUsers(true)
    getActiveUsers().then(setOrgUsers).catch(() => setOrgUsers([])).finally(() => setLoadingUsers(false))
  }, [canEdit, isArchived])

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
      .then((requests) => setAccessRequests(requests.filter((request) => request.status === 'pending')))
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

  const existingUserIds = useMemo(() => new Set(members.map((member) => member.user?.id)), [members])
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
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Access Requests Section */}
      {canEdit && accessRequests.length > 0 && (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: TOKENS.textPrimary, margin: 0 }}>Access Requests</div>
              <div style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '6px 0 0' }}>
                People asking to join this sprint.
              </div>
            </div>
            <Badge tone="planning">{accessRequests.length} pending</Badge>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {accessRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 16,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.surfaceTertiary,
                  padding: '12px 16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  style={{
                    borderRadius: 10,
                    border: 'none',
                    background: TOKENS.primary,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'white',
                    cursor: respondingRequestId === request.id ? 'not-allowed' : 'pointer',
                    opacity: respondingRequestId === request.id ? 0.6 : 1,
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectRequest(request)}
                  disabled={respondingRequestId === request.id}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${TOKENS.border}`,
                    background: 'white',
                    padding: '8px 14px',
                    fontSize: 13,
                    color: TOKENS.textSecondary,
                    fontWeight: 500,
                    cursor: respondingRequestId === request.id ? 'not-allowed' : 'pointer',
                    opacity: respondingRequestId === request.id ? 0.6 : 1,
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: TOKENS.textPrimary, margin: 0 }}>Pending Invitations</div>
              <div style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '6px 0 0' }}>
                Awaiting acceptance from invited members.
              </div>
            </div>
            <Badge tone="planning">{pendingInvitations.length} pending</Badge>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.user_id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 16,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.surfaceTertiary,
                  padding: '12px 16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {invitation.user?.name ?? invitation.user?.email ?? '—'}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: '#FEF3C7',
                        color: '#92400E',
                        borderRadius: '999px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Invitation pending
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {invitation.user?.email}
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textTertiary, marginTop: 4 }}>
                    Invited {new Date(invitation.joined_at).toLocaleDateString()}
                  </div>
                </div>

                <Badge tone="planning">{invitation.role}</Badge>

                {canEdit && !isArchived && (
                  <button
                    type="button"
                    onClick={() => handleRemovePendingInvitation(invitation.user_id)}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${TOKENS.border}`,
                      background: 'white',
                      padding: '8px 12px',
                      fontSize: 13,
                      color: TOKENS.textSecondary,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => { e.target.style.background = TOKENS.background }}
                    onMouseLeave={(e) => { e.target.style.background = 'white' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Members Section */}
      <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: TOKENS.textPrimary, margin: 0 }}>Sprint Members</div>
            <div style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '6px 0 0' }}>
              Cross-functional members assigned to this sprint.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {canEdit && !isArchived && (
              <button
                onClick={() => setShowInviteModal(true)}
                style={{
                  padding: '8px 16px',
                  background: TOKENS.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => { e.target.style.opacity = '0.9' }}
                onMouseLeave={(e) => { e.target.style.opacity = '1' }}
              >
                + Invite external
              </button>
            )}
            <Badge tone={isArchived ? 'archived' : 'active'}>{members.length} members</Badge>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {members.map((member) => {
            const expiringMemberships = member.team_memberships?.filter(
              (membership) => membership.membership_end_date && new Date(membership.membership_end_date) > new Date()
            ) ?? []

            return (
              <div
                key={member.user?.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 16,
                  border: `1px solid ${TOKENS.border}`,
                  background: TOKENS.surfaceTertiary,
                  padding: '12px 16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {member.user?.name ?? member.user?.email ?? '—'}
                    </div>
                    {member.is_temporary && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: '#FFF2D9',
                          color: '#C47E0A',
                          borderRadius: '999px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Temporary
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {member.user?.email}
                  </div>
                  {member.is_temporary && member.membership_end_date && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#DC2626' }}>
                      Expires: {new Date(`${member.membership_end_date}T00:00:00`).toLocaleDateString()}
                      {daysUntilExpiration(member.membership_end_date) <= 7 && (
                        <span style={{ marginLeft: 4, color: '#C47E0A' }}>
                          ({daysUntilExpiration(member.membership_end_date)} days)
                        </span>
                      )}
                    </div>
                  )}
                  {expiringMemberships.length > 0 && !member.is_temporary && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#DC2626' }}>
                      Expires: {expiringMemberships.map((m) => new Date(`${m.membership_end_date}T00:00:00`).toLocaleDateString()).join(', ')}
                    </div>
                  )}
                </div>

                {canEdit && !isArchived ? (
                  <>
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${TOKENS.border}`,
                        background: 'white',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: TOKENS.textPrimary,
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                        cursor: 'pointer',
                      }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>

                    <select
                      multiple
                      value={member.sprint_team_ids ?? []}
                      onChange={(e) => handleTeamChange(member.user.id, selectedValuesFromOptions(e.target.options))}
                      style={{
                        minWidth: 140,
                        borderRadius: 10,
                        border: `1px solid ${TOKENS.border}`,
                        background: 'white',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: TOKENS.textPrimary,
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                        cursor: 'pointer',
                      }}
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRemove(member.user.id)}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${TOKENS.border}`,
                        background: 'white',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: TOKENS.textSecondary,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={(e) => { e.target.style.background = TOKENS.background }}
                      onMouseLeave={(e) => { e.target.style.background = 'white' }}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <Badge tone={member.role === 'owner' ? 'completed' : member.role === 'manager' ? 'active' : 'planning'}>
                      {member.role}
                    </Badge>
                    <span style={{ fontSize: 12, color: TOKENS.textTertiary }}>
                      {member.sprint_teams?.length ? member.sprint_teams.map((team) => team.name).join(', ') : 'No team'}
                    </span>
                    {member.is_temporary && (
                      <Badge tone="archived">Temp member</Badge>
                    )}
                    {expiringMemberships.length > 0 && !member.is_temporary && (
                      <Badge tone="archived">Temp member</Badge>
                    )}
                    {member.is_temporary && member.user?.status === 'inactive' && profile?.role === 'super_admin' && (
                      <button
                        onClick={() => handleReactivate(member.user.id)}
                        disabled={reactivating === member.user.id}
                        style={{
                          padding: '4px 8px',
                          background: TOKENS.primary,
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: reactivating === member.user.id ? 'not-allowed' : 'pointer',
                          fontFamily: 'DM Sans, system-ui, sans-serif',
                          opacity: reactivating === member.user.id ? 0.6 : 1,
                        }}
                      >
                        {reactivating === member.user.id ? 'Reactivating…' : 'Reactivate'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {members.length === 0 ? (
            <EmptyState icon="👥" title="No members yet" subtitle="Add members to get started" />
          ) : null}
        </div>
      </div>

      {/* Add Member Form */}
      {canEdit && !isArchived ? (
        <div style={{ borderRadius: 20, border: `1px solid ${TOKENS.border}`, background: 'white', padding: 20, boxShadow: TOKENS.cardShadow }}>
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: TOKENS.textPrimary }}>Add member</div>
          {loadingUsers ? (
            <div style={{ padding: '1rem', color: TOKENS.textTertiary, fontSize: 13 }}>Loading...</div>
          ) : null}
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Add Form Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1fr auto', gap: 12 }}>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${TOKENS.border}`,
                  background: 'white',
                  padding: '10px 12px',
                  fontSize: 13,
                  color: TOKENS.textPrimary,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select active user</option>
                {addableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </option>
                ))}
              </select>

              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${TOKENS.border}`,
                  background: 'white',
                  padding: '10px 12px',
                  fontSize: 13,
                  color: TOKENS.textPrimary,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>

              <select
                multiple
                value={selectedTeamIds}
                onChange={(e) => setSelectedTeamIds(selectedValuesFromOptions(e.target.options))}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${TOKENS.border}`,
                  background: 'white',
                  padding: '10px 12px',
                  fontSize: 13,
                  color: TOKENS.textPrimary,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  cursor: 'pointer',
                  minHeight: 40,
                }}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedUserId || saving}
                style={{
                  borderRadius: 10,
                  border: 'none',
                  background: !selectedUserId || saving ? `${TOKENS.accent}99` : TOKENS.accent,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'white',
                  cursor: !selectedUserId || saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  transition: 'all 0.12s',
                  opacity: !selectedUserId || saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Adding…' : 'Add'}
              </button>
            </div>

            {/* Membership Expiration (Optional) */}
            {selectedTeamIds.length > 0 && (
              <div style={{ paddingTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Membership expiration (optional)
                </label>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={selectedMembershipEndDate}
                    onChange={(e) => setSelectedMembershipEndDate(e.target.value)}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${TOKENS.border}`,
                      background: 'white',
                      padding: '8px 12px',
                      fontSize: 13,
                      color: TOKENS.textPrimary,
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: 12, color: TOKENS.textTertiary }}>
                    {selectedMembershipEndDate ? 'Leave empty for permanent membership' : 'Permanent member'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Invite External Modal */}
      {showInviteModal && (
        <InviteExternalModal
          sprintId={sprintId}
          sprintEndDate={sprintEndDate}
          sprintName={sprintName}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => onChanged?.()}
        />
      )}
    </div>
  )
}
