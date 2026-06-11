import { useEffect, useMemo, useState } from 'react'
import PeopleLayout from './PeopleLayout'
import { useAuth } from '../../hooks/useAuth'
import {
  listDepartments,
  listInvitations,
  listPastorMembers,
  listUsers,
  sendInvitationEmail,
  updateUserMembership,
} from '../../lib/people/api'
import { selectDepartmentUsers, selectPastorMembers } from '../../lib/people/selectors'

const STATUS_LABELS = {
  invited: 'Invited',
  pending_activation: 'Pending Activation',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Department Lead',
  pastor: 'Pastor',
  member: 'Member',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusTone(status) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700'
  if (status === 'inactive') return 'bg-amber-50 text-amber-700'
  if (status === 'archived') return 'bg-slate-100 text-slate-600'
  if (status === 'pending_activation') return 'bg-blue-50 text-blue-700'
  return 'bg-violet-50 text-violet-700'
}

export default function UsersPage() {
  const { profile, role } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [pastorMembers, setPastorMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [filters, setFilters] = useState({
    departmentId: 'all',
    role: 'all',
    status: 'all',
    pastorId: 'all',
    search: '',
  })
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextUsers, nextDepartments, nextPastorMembers, nextInvitations] = await Promise.all([
        listUsers(),
        listDepartments(),
        listPastorMembers(),
        listInvitations(),
      ])

      setUsers(nextUsers)
      setDepartments(nextDepartments)
      setPastorMembers(nextPastorMembers)
      setInvitations(nextInvitations)
      if (!selectedUserId && nextUsers[0]) {
        setSelectedUserId(nextUsers[0].id)
      }
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const scopedUsers = useMemo(() => {
    if (role === 'dept_lead') {
      return selectDepartmentUsers(users, profile?.department_id)
    }

    if (role === 'pastor') {
      return selectPastorMembers(users, pastorMembers, profile?.id)
    }

    return users
  }, [pastorMembers, profile?.department_id, profile?.id, role, users])

  const pastorByMemberId = useMemo(() => {
    const map = new Map()
    pastorMembers.forEach((assignment) => map.set(assignment.member_id, assignment.pastor_id))
    return map
  }, [pastorMembers])

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const pendingInvitationByEmail = useMemo(() => {
    const map = new Map()
    invitations.forEach((invitation) => {
      if (invitation.status === 'pending') {
        map.set(invitation.email.toLowerCase(), invitation)
      }
    })
    return map
  }, [invitations])

  const filteredUsers = useMemo(() => {
    return scopedUsers.filter((user) => {
      if (filters.departmentId !== 'all' && user.department_id !== filters.departmentId) return false
      if (filters.role !== 'all' && user.role !== filters.role) return false
      if (filters.status !== 'all' && user.status !== filters.status) return false
      if (filters.pastorId !== 'all' && pastorByMemberId.get(user.id) !== filters.pastorId) return false

      const searchValue = filters.search.trim().toLowerCase()
      if (!searchValue) return true

      return (
        user.name?.toLowerCase().includes(searchValue) ||
        user.email?.toLowerCase().includes(searchValue)
      )
    })
  }, [filters, pastorByMemberId, scopedUsers])

  const selectedUser = filteredUsers.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null

  useEffect(() => {
    if (selectedUser) {
      setSelectedUserId(selectedUser.id)
      setDraft({
        role: selectedUser.role,
        departmentId: selectedUser.department_id ?? '',
        status: selectedUser.status,
        assignedPastorId: pastorByMemberId.get(selectedUser.id) ?? '',
      })
    } else {
      setDraft(null)
    }
  }, [pastorByMemberId, selectedUser?.department_id, selectedUser?.id, selectedUser?.role, selectedUser?.status])

  const canManageUser = (user) => {
    if (!user) return false
    if (role === 'super_admin') return user.id !== profile?.id
    if (role === 'dept_lead') {
      return user.role === 'member' && user.department_id === profile?.department_id
    }
    return false
  }

  const handleSave = async (reason = 'Membership updated') => {
    if (!selectedUser || !draft) return
    setSaving(true)
    setError('')
    try {
      await updateUserMembership({
        userId: selectedUser.id,
        role: draft.role,
        departmentId: draft.departmentId || null,
        status: draft.status,
        assignedPastorId: draft.assignedPastorId || null,
        reason,
      })
      await loadData()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleResendInvite = async (userEmail) => {
    const invitation = pendingInvitationByEmail.get(userEmail.toLowerCase())
    if (!invitation) return
    setSaving(true)
    setError('')
    try {
      await sendInvitationEmail(invitation.id, 'resend')
      await loadData()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  const pastors = scopedUsers.filter((user) => user.role === 'pastor')

  return (
    <PeopleLayout
      title="Users"
      description="Manage role assignment, department membership, lifecycle status, and pastoral ownership."
    >
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search name or email"
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <select
              value={filters.departmentId}
              onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              value={filters.role}
              onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filters.pastorId}
              onChange={(event) => setFilters((current) => ({ ...current, pastorId: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All pastors</option>
              {pastors.map((pastor) => (
                <option key={pastor.id} value={pastor.id}>
                  {pastor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Role</th>
                  <th className="px-3 py-3 font-medium">Department</th>
                  <th className="px-3 py-3 font-medium">Pastor</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const pastor = userById.get(pastorByMemberId.get(user.id))
                  const department = departmentById.get(user.department_id)
                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={[
                        'cursor-pointer border-b border-[var(--border)]/60 transition-colors hover:bg-[var(--surface-secondary)]',
                        user.id === selectedUserId ? 'bg-[var(--surface-secondary)]' : '',
                      ].join(' ')}
                    >
                      <td className="px-3 py-3 font-medium text-[var(--text-primary)]">{user.name}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{user.email}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{ROLE_LABELS[user.role] ?? user.role}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{department?.name ?? '—'}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{pastor?.name ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(user.status)}`}>
                          {STATUS_LABELS[user.status] ?? user.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(user.last_active_at)}</td>
                    </tr>
                  )
                })}

                {!loading && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                      No users match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              User Detail
            </div>
            <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              {selectedUser?.name ?? 'Select a user'}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {selectedUser?.email ?? 'Choose a row to review and manage membership.'}
            </p>
          </div>

          {selectedUser && draft && (
            <>
              <div className="grid gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Role
                  </span>
                  <select
                    value={draft.role}
                    disabled={!canManageUser(selectedUser) || role === 'dept_lead'}
                    onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Department
                  </span>
                  <select
                    value={draft.departmentId}
                    disabled={!canManageUser(selectedUser)}
                    onChange={(event) => setDraft((current) => ({ ...current, departmentId: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
                  >
                    <option value="">Unassigned</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Status
                  </span>
                  <select
                    value={draft.status}
                    disabled={!canManageUser(selectedUser)}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Assigned Pastor
                  </span>
                  <select
                    value={draft.assignedPastorId}
                    disabled={!canManageUser(selectedUser) || draft.role !== 'member'}
                    onChange={(event) => setDraft((current) => ({ ...current, assignedPastorId: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
                  >
                    <option value="">No pastor assigned</option>
                    {pastors
                      .filter((pastor) => pastor.department_id === draft.departmentId)
                      .map((pastor) => (
                        <option key={pastor.id} value={pastor.id}>
                          {pastor.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={!canManageUser(selectedUser) || saving}
                  onClick={() => handleSave('User membership updated')}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={!canManageUser(selectedUser) || saving}
                  onClick={() =>
                    updateUserMembership({
                      userId: selectedUser.id,
                      status: 'inactive',
                      reason: 'User deactivated from People module',
                    }).then(loadData).catch((nextError) => setError(nextError.message))
                  }
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Deactivate
                </button>
                <button
                  type="button"
                  disabled={!canManageUser(selectedUser) || saving}
                  onClick={() =>
                    updateUserMembership({
                      userId: selectedUser.id,
                      status: 'archived',
                      reason: 'User archived from People module',
                    }).then(loadData).catch((nextError) => setError(nextError.message))
                  }
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Archive
                </button>
                <button
                  type="button"
                  disabled={!pendingInvitationByEmail.has(selectedUser.email.toLowerCase()) || saving}
                  onClick={() => handleResendInvite(selectedUser.email)}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Resend Invite
                </button>
              </div>

              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div>View: full member record and current assignment state.</div>
                <div>Edit: role, department, status, and pastor where permitted.</div>
              </div>
            </>
          )}
        </aside>
      </div>
    </PeopleLayout>
  )
}
