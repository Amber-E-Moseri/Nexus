import { useEffect, useMemo, useState } from 'react'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { listUsers, listInvitations, listDepartments } from '../../lib/people/api'
import { deactivateUser, reactivateUser, updateUserRole, revokeInvitation } from '../../lib/users'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Dept Lead',
  pastor: 'Pastor',
  member: 'Member',
}

const ROLE_TONES = {
  super_admin: { bg: '#EFE7FF', text: '#6B3FD4' },
  dept_lead: { bg: '#E8EEFF', text: '#2E5BCE' },
  pastor: { bg: '#FFF0D9', text: '#C47E0A' },
  member: { bg: '#F4EFE8', text: '#8A6F47' },
}

const STATUS_TONES = {
  active: { bg: '#E7F8ED', text: '#2D8653', border: '#A6E2BB' },
  deactivated: { bg: '#FDEBE6', text: '#C94830', border: '#F3B6A8' },
  pending: { bg: '#FFF2D9', text: '#C47E0A', border: '#F1C46D' },
}

function roleTone(role) {
  return ROLE_TONES[role] ?? { bg: '#F4EFE8', text: '#8A6F47' }
}

function statusTone(status) {
  return STATUS_TONES[status] ?? { bg: '#F4F1EA', text: '#9E9488', border: '#E1D6C7' }
}

export default function MembersPanel() {
  const { profile, role, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)

  const canDeactivate = role === 'super_admin' || role === 'owner'
  const canChangeRoles = role === 'super_admin' || role === 'owner'
  const canAssignAdmin = role === 'super_admin'

  const departmentMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments]
  )

  const members = useMemo(() => {
    const active = users
      .filter((u) => !u.deactivated_at)
      .map((u) => ({
        ...u,
        type: 'user',
        status: 'active',
        displayName: u.name,
        displayEmail: u.email,
      }))

    const deactivated = users
      .filter((u) => u.deactivated_at)
      .map((u) => ({
        ...u,
        type: 'user',
        status: 'deactivated',
        displayName: u.name,
        displayEmail: u.email,
      }))

    const pending = invitations
      .filter((i) => i.status === 'pending')
      .map((i) => ({
        ...i,
        type: 'invitation',
        status: 'pending',
        displayName: `${i.first_name} ${i.last_name}`.trim(),
        displayEmail: i.email,
      }))

    return {
      active,
      deactivated,
      pending,
    }
  }, [users, invitations])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [nextUsers, nextInvitations, nextDepartments] = await Promise.all([
          listUsers(),
          listInvitations(),
          listDepartments(),
        ])
        setUsers(nextUsers)
        setInvitations(nextInvitations)
        setDepartments(nextDepartments)
      } catch (error) {
        showToast(error.message, { tone: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [showToast])

  const handleDeactivate = async (userId, userName) => {
    if (userId === profile?.id) {
      showToast('Cannot deactivate yourself', { tone: 'error' })
      return
    }

    setConfirmAction({
      userId,
      action: 'deactivate',
      message: `Deactivate ${userName}? They will lose access immediately.`,
      onConfirm: async () => {
        setSaving(true)
        try {
          await deactivateUser(userId, profile.id)
          showToast(`${userName} has been deactivated`, { tone: 'success' })
          const nextUsers = await listUsers()
          setUsers(nextUsers)
        } catch (error) {
          showToast(error.message, { tone: 'error' })
        } finally {
          setSaving(false)
          setConfirmAction(null)
        }
      },
    })
  }

  const handleReactivate = async (userId, userName) => {
    setSaving(true)
    try {
      await reactivateUser(userId)
      showToast(`${userName} has been reactivated`, { tone: 'success' })
      const nextUsers = await listUsers()
      setUsers(nextUsers)
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (userId, userName, newRole) => {
    if (newRole === 'super_admin' && role !== 'super_admin') {
      showToast('Cannot assign super_admin role', { tone: 'error' })
      return
    }

    setSaving(true)
    try {
      await updateUserRole(userId, newRole)
      showToast(`${userName}'s role updated to ${ROLE_LABELS[newRole]}`, { tone: 'success' })
      const nextUsers = await listUsers()
      setUsers(nextUsers)
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeInvitation = async (invitationId, email) => {
    setConfirmAction({
      invitationId,
      action: 'revoke',
      message: `Revoke invitation to ${email}?`,
      onConfirm: async () => {
        setSaving(true)
        try {
          await revokeInvitation(invitationId)
          showToast('Invitation revoked', { tone: 'success' })
          const nextInvitations = await listInvitations()
          setInvitations(nextInvitations)
        } catch (error) {
          showToast(error.message, { tone: 'error' })
        } finally {
          setSaving(false)
          setConfirmAction(null)
        }
      },
    })
  }

  const getRoleOptions = () => {
    if (role === 'super_admin') {
      return ['member', 'pastor', 'dept_lead', 'super_admin']
    }
    if (role === 'owner') {
      return ['member', 'contributor', 'viewer']
    }
    return []
  }

  const renderMemberRow = (member) => {
    const department = departmentMap.get(member.department_id)
    const statusBadge = statusTone(member.status)
    const isDeactivated = member.status === 'deactivated'
    const isPending = member.type === 'invitation'

    return (
      <tr
        key={member.id}
        className="border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Avatar & Name */}
        <td style={{ padding: '16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Avatar name={member.displayName} src={member.avatar_url} />
            <div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: isDeactivated ? '#9E9488' : 'var(--text-primary)',
                  textDecoration: isDeactivated ? 'line-through' : 'none',
                }}
              >
                {member.displayName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {member.displayEmail}
              </div>
            </div>
          </div>
        </td>

        {/* Department */}
        <td
          style={{
            padding: '16px',
            fontSize: '14px',
            color: 'var(--text-primary)',
            borderRight: '1px solid var(--border)',
          }}
        >
          {department?.name || '—'}
        </td>

        {/* Role */}
        <td
          style={{
            padding: '16px',
            borderRight: '1px solid var(--border)',
          }}
        >
          {canChangeRoles && !isPending && !isDeactivated ? (
            <select
              disabled={saving}
              value={member.role || 'member'}
              onChange={(e) => handleRoleChange(member.id, member.displayName, e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {getRoleOptions().map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          ) : (
            <span
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: '600',
                background: roleTone(member.role).bg,
                color: roleTone(member.role).text,
              }}
            >
              {ROLE_LABELS[member.role] || member.role}
            </span>
          )}
        </td>

        {/* Status */}
        <td
          style={{
            padding: '16px',
            borderRight: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: '600',
              background: statusBadge.bg,
              color: statusBadge.text,
              border: `1px solid ${statusBadge.border}`,
            }}
          >
            {member.status === 'active'
              ? 'Active'
              : member.status === 'deactivated'
                ? 'Deactivated'
                : 'Pending'}
          </span>
        </td>

        {/* Actions */}
        <td style={{ padding: '16px', textAlign: 'right' }}>
          {confirmAction?.userId === member.id || confirmAction?.invitationId === member.id ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {confirmAction.message}
              </span>
              <button
                disabled={saving}
                onClick={confirmAction.onConfirm}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--accent)',
                  background: 'transparent',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Confirm
              </button>
              <button
                disabled={saving}
                onClick={() => setConfirmAction(null)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {!isPending && canDeactivate ? (
                isDeactivated ? (
                  <button
                    disabled={saving}
                    onClick={() => handleReactivate(member.id, member.displayName)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #2D8653',
                      background: 'transparent',
                      color: '#2D8653',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Reactivate
                  </button>
                ) : (
                  <button
                    disabled={saving}
                    onClick={() =>
                      handleDeactivate(member.id, member.displayName)
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #C94830',
                      background: 'transparent',
                      color: '#C94830',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Deactivate
                  </button>
                )
              ) : null}
              {isPending && canChangeRoles ? (
                <button
                  disabled={saving}
                  onClick={() =>
                    handleRevokeInvitation(member.id, member.displayEmail)
                  }
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #C94830',
                    background: 'transparent',
                    color: '#C94830',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Revoke
                </button>
              ) : null}
            </div>
          )}
        </td>
      </tr>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading members…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Active Members */}
      <section style={{ borderRadius: '22px', border: '1px solid var(--border)', background: 'white', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
            Active Members ({members.active.length})
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Department</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Role</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}> </th>
            </tr>
          </thead>
          <tbody>
            {members.active.map(renderMemberRow)}
            {members.active.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No active members
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Pending Invitations */}
      {members.pending.length > 0 && (
        <section style={{ borderRadius: '22px', border: '1px solid var(--border)', background: 'white', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
              Pending Invitations ({members.pending.length})
            </h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Role</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}> </th>
              </tr>
            </thead>
            <tbody>
              {members.pending.map(renderMemberRow)}
            </tbody>
          </table>
        </section>
      )}

      {/* Deactivated Members */}
      {members.deactivated.length > 0 && (
        <section style={{ borderRadius: '22px', border: '1px solid var(--border)', background: 'white', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
              Deactivated Members ({members.deactivated.length})
            </h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Role</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}> </th>
              </tr>
            </thead>
            <tbody>
              {members.deactivated.map(renderMemberRow)}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
