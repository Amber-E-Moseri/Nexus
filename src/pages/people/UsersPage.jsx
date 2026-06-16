import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PeopleLayout from './PeopleLayout'
import { useAuth } from '../../hooks/useAuth'
import { formatLastActive } from '../../lib/dateUtils'
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
  pending_activation: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
}

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
  pending_activation: { bg: '#FFF2D9', text: '#C47E0A', border: '#F1C46D' },
  inactive: { bg: '#F4EFE8', text: '#8B7762', border: '#E1D6C7' },
  archived: { bg: '#F4EFE8', text: '#8B7762', border: '#E1D6C7' },
  invited: { bg: '#FFF2D9', text: '#C47E0A', border: '#F1C46D' },
}

const SUMMARY_CARD_STYLES = {
  active: {
    bg: '#563199',
    text: '#FFFFFF',
    accent: 'rgba(255,255,255,0.08)',
    border: '#563199',
  },
  pending: {
    bg: '#F2A81D',
    text: '#FFFFFF',
    accent: 'rgba(255,255,255,0.16)',
    border: '#F2A81D',
  },
  inactive: {
    bg: '#1F1739',
    text: '#FFFFFF',
    accent: 'rgba(255,255,255,0.08)',
    border: '#1F1739',
  },
  invites: {
    bg: '#FFF6F3',
    text: '#D35C3A',
    accent: 'rgba(211,92,58,0.08)',
    border: '#F4C5B8',
  },
}

function getInitials(name = '', email = '') {
  const source = name || email || '?'
  return source
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function toneForStatus(status) {
  return STATUS_TONES[status] ?? { bg: 'var(--accent-light)', text: 'var(--accent)', border: 'transparent' }
}

function toneForRole(role) {
  return ROLE_TONES[role] ?? { bg: '#F4EFE8', text: '#8A6F47' }
}

function SummaryCard({ label, value, tone }) {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] border px-4 py-4"
      style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
    >
      <div
        className="absolute -bottom-5 right-[-10px] h-16 w-16 rounded-full"
        style={{ background: tone.accent }}
      />
      <div className="relative text-[11px] font-semibold uppercase tracking-[0.08em] opacity-90">{label}</div>
      <div className="relative mt-2 text-[18px] font-semibold">{value}</div>
    </div>
  )
}

function FilterChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
      style={{
        borderColor: active ? '#563199' : '#E6DED1',
        background: active ? '#563199' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#7A6F5E',
      }}
    >
      {children}
    </button>
  )
}

export default function UsersPage() {
  const navigate = useNavigate()
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

  const scopedInvitations = useMemo(() => {
    if (role === 'dept_lead') {
      return invitations.filter((invitation) => invitation.department_id === profile?.department_id)
    }

    if (role === 'pastor') {
      return invitations.filter((invitation) => invitation.assigned_pastor_id === profile?.id)
    }

    return invitations
  }, [invitations, profile?.department_id, profile?.id, role])

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
    scopedInvitations.forEach((invitation) => {
      if (invitation.status === 'pending') {
        map.set(invitation.email.toLowerCase(), invitation)
      }
    })
    return map
  }, [scopedInvitations])

  const filteredUsers = useMemo(() => {
    return scopedUsers.filter((user) => {
      if (filters.departmentId !== 'all' && user.department_id !== filters.departmentId) return false
      if (filters.role !== 'all' && user.role !== filters.role) return false
      if (filters.status !== 'all' && user.status !== filters.status) return false
      if (filters.pastorId !== 'all' && pastorByMemberId.get(user.id) !== filters.pastorId) return false

      const searchValue = filters.search.trim().toLowerCase()
      if (!searchValue) return true

      return user.name?.toLowerCase().includes(searchValue) || user.email?.toLowerCase().includes(searchValue)
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

  const handleStatusUpdate = async (status, reason) => {
    if (!selectedUser) return
    setSaving(true)
    setError('')
    try {
      await updateUserMembership({
        userId: selectedUser.id,
        status,
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

  const summary = useMemo(() => ({
    active: scopedUsers.filter((user) => user.status === 'active').length,
    pending: scopedUsers.filter((user) => user.status === 'pending_activation').length,
    inactive: scopedUsers.filter((user) => user.status === 'inactive' || user.status === 'archived').length,
    invites: scopedInvitations.filter((invitation) => invitation.status === 'pending').length,
  }), [scopedInvitations, scopedUsers])

  const visibleCount = filteredUsers.length

  return (
    <PeopleLayout
      title="Users"
      description="Manage member access, activation state, and department ownership."
      actions={
        role === 'super_admin' || role === 'dept_lead' ? (
          <button
            type="button"
            onClick={() => navigate('/people/invitations')}
            className="rounded-full bg-[#F2A81D] px-4 py-2 text-sm font-semibold text-white"
          >
            + Invite
          </button>
        ) : null
      }
    >
      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-4">
        <SummaryCard label="Active Members" value={summary.active} tone={SUMMARY_CARD_STYLES.active} />
        <SummaryCard label="Pending Activation" value={summary.pending} tone={SUMMARY_CARD_STYLES.pending} />
        <SummaryCard label="Inactive / Archived" value={summary.inactive} tone={SUMMARY_CARD_STYLES.inactive} />
        <SummaryCard label="Pending Invitations" value={summary.invites} tone={SUMMARY_CARD_STYLES.invites} />
      </section>

      <section className="space-y-4 rounded-[22px] border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-secondary)]">{visibleCount} members</div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filters.status === 'all'} onClick={() => setFilters((current) => ({ ...current, status: 'all' }))}>All</FilterChip>
            <FilterChip active={filters.status === 'active'} onClick={() => setFilters((current) => ({ ...current, status: 'active' }))}>Active</FilterChip>
            <FilterChip active={filters.status === 'pending_activation'} onClick={() => setFilters((current) => ({ ...current, status: 'pending_activation' }))}>Pending</FilterChip>
            <FilterChip active={filters.status === 'inactive'} onClick={() => setFilters((current) => ({ ...current, status: 'inactive' }))}>Inactive</FilterChip>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(150px,1fr))]">
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search by name or email"
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

        <div className="overflow-x-auto rounded-[18px] border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-secondary)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-4">Member</th>
                <th className="px-4 py-4">Role</th>
                <th className="px-4 py-4">Department</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Last Active</th>
                <th className="px-4 py-4 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const department = departmentById.get(user.department_id)
                const statusTone = toneForStatus(user.status)
                const roleTone = toneForRole(user.role)
                const isSelected = user.id === selectedUserId

                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={[
                      'cursor-pointer border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-secondary)]',
                      isSelected ? 'bg-[var(--surface-secondary)]' : 'bg-white',
                    ].join(' ')}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ background: department?.color ? `#${department.color}` : '#563199' }}
                        >
                          {getInitials(user.name, user.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text-primary)]">{user.name}</div>
                          <div className="truncate text-xs text-[var(--text-secondary)]">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ background: roleTone.bg, color: roleTone.text }}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[var(--text-primary)]">{department?.name ?? '—'}</td>
                    <td className="px-4 py-4">
                      <span
                        className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={{ background: statusTone.bg, color: statusTone.text, borderColor: statusTone.border }}
                      >
                        {STATUS_LABELS[user.status] ?? user.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatLastActive(user.last_active_at)}</td>
                    <td className="px-4 py-4 text-right text-[var(--text-tertiary)]">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedUserId(user.id)
                        }}
                        className="rounded-lg p-1.5 hover:bg-[var(--surface-tertiary)]"
                        aria-label={`Manage ${user.name}`}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {!loading && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-secondary)]">
                    No users match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUser && draft ? (
        <section className="rounded-[22px] border border-[var(--border)] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Selected Member</div>
              <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{selectedUser.name}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedUser.email}</p>
            </div>
            {pendingInvitationByEmail.has(selectedUser.email.toLowerCase()) ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleResendInvite(selectedUser.email)}
                className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
              >
                Resend Invite
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Role</span>
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
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Department</span>
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
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Status</span>
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
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Assigned Pastor</span>
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

            <div className="flex items-end">
              <button
                type="button"
                disabled={!canManageUser(selectedUser) || saving}
                onClick={() => handleSave('User membership updated')}
                className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canManageUser(selectedUser) || saving}
              onClick={() => handleStatusUpdate('inactive', 'User deactivated from People module')}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
            >
              Deactivate
            </button>
            <button
              type="button"
              disabled={!canManageUser(selectedUser) || saving}
              onClick={() => handleStatusUpdate('archived', 'User archived from People module')}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
            >
              Archive
            </button>
          </div>
        </section>
      ) : null}
    </PeopleLayout>
  )
}
