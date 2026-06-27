import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import {
  createInvitation,
  listDepartments,
  listInvitations,
  listUsers,
  resendInvitation,
  sendInvitationEmail,
  updateUserMembership,
  resetUserPassword,
} from '../../lib/people/api'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Dept Lead',
  pastor: 'Pastor',
  member: 'Member',
}

const STATUS_TABS = ['Active', 'Inactive', 'Pending']

function getInitials(name = '', email = '') {
  const source = name || email || '?'
  return source
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function debounceText(value) {
  return value.trim().toLowerCase()
}

function InviteMemberModal({ departments, pastors, initialDepartmentId, role, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    departmentId: role === 'dept_lead' ? (initialDepartmentId ?? '') : '',
    role: 'member',
    assignedPastorId: '',
    message: '',
  })

  const scopedDepartments = role === 'dept_lead'
    ? departments.filter((department) => department.id === initialDepartmentId)
    : departments

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          background: '#FFFFFF',
          borderRadius: 20,
          border: '1px solid #EDE8DC',
          boxShadow: '0 20px 45px rgba(45,42,34,0.16)',
          padding: 24,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2D2A22' }}>Invite member</div>
            <div style={{ fontSize: 13, color: '#9E9488', marginTop: 4 }}>Send a new onboarding invitation.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#9E9488', cursor: 'pointer' }}
            aria-label="Close invite member modal"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(form)
          }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
        >
          <input
            required
            value={form.firstName}
            onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            placeholder="First name"
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
          />
          <input
            required
            value={form.lastName}
            onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            placeholder="Last name"
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Email address"
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13, gridColumn: '1 / -1' }}
          />
          <select
            required
            disabled={role === 'dept_lead'}
            value={form.departmentId}
            onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, assignedPastorId: '' }))}
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13, background: role === 'dept_lead' ? '#F9F7F1' : '#FFFFFF' }}
          >
            <option value="">Select department</option>
            {scopedDepartments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <select
            required
            disabled={role !== 'super_admin'}
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13, background: role !== 'super_admin' ? '#F9F7F1' : '#FFFFFF' }}
          >
            <option value="member">Member</option>
            {role === 'super_admin' ? (
              <>
                <option value="pastor">Pastor</option>
                <option value="dept_lead">Department Lead</option>
                <option value="super_admin">Super Admin</option>
              </>
            ) : null}
          </select>
          <select
            value={form.assignedPastorId}
            onChange={(event) => setForm((current) => ({ ...current, assignedPastorId: event.target.value }))}
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13, gridColumn: '1 / -1' }}
          >
            <option value="">Assigned pastor (optional)</option>
            {pastors
              .filter((pastor) => pastor.department_id === form.departmentId)
              .map((pastor) => (
                <option key={pastor.id} value={pastor.id}>{pastor.name}</option>
              ))}
          </select>
          <textarea
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            placeholder="Optional welcome message"
            rows={4}
            style={{ border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13, gridColumn: '1 / -1', resize: 'vertical' }}
          />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ border: '1px solid #EDE8DC', background: '#FFFFFF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ border: 'none', background: '#4C2A92', color: '#FFFFFF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Sending...' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MembersPanel() {
  const { profile, role } = useAuth()
  const { showToast } = useToast()
  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('Active')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(debounceText(search)), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  async function loadData() {
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

  useEffect(() => {
    loadData()
  }, [])

  const scopedUsers = useMemo(() => {
    if (role === 'dept_lead') {
      return users.filter((entry) => entry.department_id === profile?.department_id)
    }
    return users
  }, [profile?.department_id, role, users])

  const scopedInvitations = useMemo(() => {
    if (role === 'dept_lead') {
      return invitations.filter((entry) => entry.department_id === profile?.department_id)
    }
    return invitations
  }, [invitations, profile?.department_id, role])

  const departmentMap = useMemo(
    () => new Map(departments.map((entry) => [entry.id, entry.name])),
    [departments],
  )

  const pastors = useMemo(
    () => scopedUsers.filter((entry) => entry.role === 'pastor' && entry.status === 'active'),
    [scopedUsers],
  )

  const pendingInvitationByEmail = useMemo(() => {
    const map = new Map()
    scopedInvitations
      .filter((entry) => entry.status === 'pending')
      .forEach((entry) => map.set(entry.email.toLowerCase(), entry))
    return map
  }, [scopedInvitations])

  const filteredUsers = useMemo(() => {
    const source = activeTab === 'Inactive'
      ? scopedUsers.filter((entry) => entry.status === 'inactive' || entry.status === 'archived')
      : scopedUsers.filter((entry) => entry.status === 'active')

    if (!debouncedSearch) return source

    return source.filter((entry) =>
      entry.name?.toLowerCase().includes(debouncedSearch) ||
      entry.email?.toLowerCase().includes(debouncedSearch),
    )
  }, [activeTab, debouncedSearch, scopedUsers])

  const filteredInvitations = useMemo(() => {
    const source = scopedInvitations.filter((entry) => entry.status === 'pending')
    if (!debouncedSearch) return source

    return source.filter((entry) =>
      `${entry.first_name} ${entry.last_name}`.trim().toLowerCase().includes(debouncedSearch) ||
      entry.email?.toLowerCase().includes(debouncedSearch),
    )
  }, [debouncedSearch, scopedInvitations])

  async function handleInviteMember(form) {
    setSaving(true)
    try {
      const invitation = await createInvitation(form)
      await sendInvitationEmail(invitation.id, 'send')
      showToast('Invitation sent.', { tone: 'success' })
      setShowInviteModal(false)
      setActiveTab('Pending')
      await loadData()
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(userId, nextRole) {
    setSaving(true)
    try {
      await updateUserMembership({
        userId,
        role: nextRole,
        reason: `Role changed to ${nextRole}`,
      })
      showToast('Role updated.', { tone: 'success' })
      await loadData()
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(userId) {
    setSaving(true)
    try {
      await updateUserMembership({
        userId,
        status: 'inactive',
        reason: 'Deactivated from settings',
      })
      showToast('Member deactivated.', { tone: 'success' })
      await loadData()
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleResend(invitationId) {
    setSaving(true)
    try {
      await resendInvitation(invitationId)
      await sendInvitationEmail(invitationId, 'resend')
      showToast('Invitation re-sent.', { tone: 'success' })
      await loadData()
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(userId, userEmail) {
    if (!window.confirm(`Reset password for ${userEmail}? They will receive a password reset email.`)) {
      return
    }

    setSaving(true)
    try {
      await resetUserPassword(userId)
      showToast(`Password reset email sent to ${userEmail}.`, { tone: 'success' })
    } catch (error) {
      showToast(error.message, { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                border: `1px solid ${activeTab === tab ? '#4C2A92' : '#EDE8DC'}`,
                background: activeTab === tab ? '#4C2A92' : '#FFFFFF',
                color: activeTab === tab ? '#FFFFFF' : '#2D2A22',
                borderRadius: 999,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {(role === 'super_admin' || role === 'dept_lead') ? (
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            style={{ border: 'none', background: '#4C2A92', color: '#FFFFFF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Invite member
          </button>
        ) : null}
      </div>

      <div>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
          style={{ width: '100%', maxWidth: 360, border: '1px solid #EDE8DC', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
        />
      </div>

      <div style={{ borderRadius: 22, border: '1px solid #EDE8DC', background: '#FFFFFF', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9F7F1', borderBottom: '1px solid #EDE8DC' }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Name</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Email</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Role</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Department</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#9E9488', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9E9488', fontSize: 13 }}>Loading members...</td>
              </tr>
            ) : activeTab === 'Pending' ? (
              filteredInvitations.length > 0 ? filteredInvitations.map((invitation) => (
                <tr key={invitation.id} style={{ borderBottom: '1px solid #EDE8DC' }}>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 999, background: '#4C2A92', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {getInitials(`${invitation.first_name} ${invitation.last_name}`, invitation.email)}
                      </div>
                      <span>{`${invitation.first_name} ${invitation.last_name}`.trim() || invitation.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{invitation.email}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{ROLE_LABELS[invitation.role] ?? invitation.role}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{departmentMap.get(invitation.department_id) ?? '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#C47E0A' }}>Pending</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    {role === 'super_admin' ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleResend(invitation.id)}
                        style={{ border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#4C2A92', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                      >
                        Re-invite
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9E9488' }}>View only</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9E9488', fontSize: 13 }}>No pending invitations.</td>
                </tr>
              )
            ) : filteredUsers.length > 0 ? filteredUsers.map((entry) => {
              const pendingInvitation = pendingInvitationByEmail.get(entry.email?.toLowerCase())
              const canManage = role === 'super_admin'

              return (
                <tr key={entry.id} style={{ borderBottom: '1px solid #EDE8DC' }}>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 999, background: '#4C2A92', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                        {getInitials(entry.name, entry.email)}
                      </div>
                      <span>{entry.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{entry.email}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>
                    {canManage && activeTab === 'Active' ? (
                      <select
                        disabled={saving}
                        value={entry.role}
                        onChange={(event) => handleRoleChange(entry.id, event.target.value)}
                        style={{ border: '1px solid #EDE8DC', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: '#FFFFFF' }}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="dept_lead">Dept Lead</option>
                        <option value="pastor">Pastor</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      ROLE_LABELS[entry.role] ?? entry.role
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{departmentMap.get(entry.department_id) ?? '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#2D2A22' }}>{entry.status}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    {canManage && activeTab === 'Active' ? (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleResetPassword(entry.id, entry.email)}
                          style={{ border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#4C2A92', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleDeactivate(entry.id)}
                          style={{ border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#C94830', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                        >
                          Deactivate
                        </button>
                        {pendingInvitation ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleResend(pendingInvitation.id)}
                            style={{ border: '1px solid #EDE8DC', background: '#FFFFFF', color: '#4C2A92', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                          >
                            Re-invite
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9E9488' }}>View only</span>
                    )}
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
                  {activeTab === 'Inactive' ? 'No inactive members.' : 'No active members.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showInviteModal ? (
        <InviteMemberModal
          departments={departments}
          pastors={pastors}
          initialDepartmentId={profile?.department_id}
          role={role}
          saving={saving}
          onClose={() => setShowInviteModal(false)}
          onSubmit={handleInviteMember}
        />
      ) : null}
    </div>
  )
}
