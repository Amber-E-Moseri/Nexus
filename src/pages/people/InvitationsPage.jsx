import { useEffect, useMemo, useState } from 'react'
import PeopleLayout from './PeopleLayout'
import { useAuth } from '../../hooks/useAuth'
import {
  cancelInvitation,
  copyInvitationLink,
  createBulkInvitations,
  createInvitation,
  listDepartments,
  listInvitations,
  listUsers,
  sendInvitationEmail,
} from '../../lib/people/api'
import { parseInvitationCsv } from '../../lib/people/csv'

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
  pending: { bg: '#FFF2D9', text: '#C47E0A', border: '#F1C46D' },
  accepted: { bg: '#E7F8ED', text: '#2D8653', border: '#A6E2BB' },
  expired: { bg: '#F4EFE8', text: '#8B7762', border: '#E1D6C7' },
  revoked: { bg: '#FDEBE6', text: '#C94830', border: '#F3B6A8' },
}

function formatRelativeTime(value) {
  if (!value) return 'Recently'

  const diffMs = Date.now() - new Date(value).getTime()
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMs < 3600000) return `${Math.max(1, Math.floor(diffMs / 60000))} min ago`
  if (diffMs < 86400000) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  return `${Math.floor(diffDays / 7)} weeks ago`
}

function roleTone(role) {
  return ROLE_TONES[role] ?? { bg: '#F4EFE8', text: '#8A6F47' }
}

function statusTone(status) {
  return STATUS_TONES[status] ?? { bg: 'var(--surface-secondary)', text: 'var(--text-secondary)', border: 'transparent' }
}

function DepartmentGlyph({ department }) {
  const color = department?.color ? `#${department.color}` : '#563199'
  const label = department?.name?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold text-white"
      style={{ background: color }}
    >
      {label}
    </span>
  )
}

export default function InvitationsPage() {
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    departmentId: '',
    role: 'member',
    assignedPastorId: '',
    message: '',
  })
  const [csvRows, setCsvRows] = useState([])
  const [importReport, setImportReport] = useState(null)
  const [latestLink, setLatestLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canManage = role === 'super_admin' || role === 'dept_lead'

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [nextDepartments, nextUsers, nextInvitations] = await Promise.all([
        listDepartments(),
        listUsers(),
        listInvitations(),
      ])

      setDepartments(nextDepartments)
      setUsers(nextUsers)
      setInvitations(nextInvitations)

      if (role === 'dept_lead' && profile?.department_id) {
        setForm((current) => ({
          ...current,
          departmentId: profile.department_id,
          role: 'member',
        }))
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

  const scopedDepartments = useMemo(() => {
    if (role === 'dept_lead') {
      return departments.filter((department) => department.id === profile?.department_id)
    }

    return departments
  }, [departments, profile?.department_id, role])

  const scopedUsers = useMemo(() => {
    if (role === 'dept_lead') {
      return users.filter((user) => user.department_id === profile?.department_id)
    }

    return users
  }, [profile?.department_id, role, users])

  const pastors = useMemo(() => {
    return scopedUsers.filter((user) => user.role === 'pastor')
  }, [scopedUsers])

  const scopedInvitations = useMemo(() => {
    const base = role === 'dept_lead'
      ? invitations.filter((invitation) => invitation.department_id === profile?.department_id)
      : invitations

    return [...base].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  }, [invitations, profile?.department_id, role])

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  )

  const summary = useMemo(() => ({
    pending: scopedInvitations.filter((invitation) => invitation.status === 'pending').length,
    accepted: scopedInvitations.filter((invitation) => invitation.status === 'accepted').length,
    expired: scopedInvitations.filter((invitation) => invitation.status === 'expired').length,
  }), [scopedInvitations])

  const handleSend = async (invitationId, mode = 'send') => {
    setSaving(true)
    setError('')

    try {
      const response = await sendInvitationEmail(invitationId, mode)
      setLatestLink(response.activation_url ?? '')
      await loadData()
    } catch (nextError) {
      setError(nextError.message)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const handleCreateInvitation = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setLatestLink('')

    try {
      const invitation = await createInvitation(form)
      await handleSend(invitation.id, 'send')
      setForm((current) => ({
        ...current,
        firstName: '',
        lastName: '',
        email: '',
        assignedPastorId: '',
        message: '',
      }))
      setFormOpen(false)
    } catch (nextError) {
      setError(nextError.message)
      setSaving(false)
    }
  }

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setCsvRows(parseInvitationCsv(text))
  }

  const handleImport = async () => {
    setSaving(true)
    setError('')

    try {
      const report = await createBulkInvitations(csvRows)
      setImportReport(report)
      await loadData()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyLink = async (invitationId) => {
    setSaving(true)
    setError('')

    try {
      const response = await copyInvitationLink(invitationId)
      setLatestLink(response.activationUrl)
      await navigator.clipboard.writeText(response.activationUrl)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PeopleLayout
      title="People"
      description="Manage members, roles and lifecycle across the organization."
      actions={
        canManage ? (
          <button
            type="button"
            onClick={() => setFormOpen((current) => !current)}
            className="rounded-xl bg-[#F2A81D] px-4 py-2.5 text-sm font-semibold text-white"
          >
            + Invite Member
          </button>
        ) : null
      }
    >
      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      {formOpen ? (
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[22px] border border-[var(--border)] bg-white p-5">
            <div className="mb-4 text-base font-semibold text-[var(--text-primary)]">Invite member</div>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateInvitation}>
              <input
                required
                value={form.firstName}
                onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                placeholder="First name"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                required
                value={form.lastName}
                onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                placeholder="Last name"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email address"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
              />
              <select
                required
                value={form.departmentId}
                disabled={role === 'dept_lead'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    departmentId: event.target.value,
                    assignedPastorId: '',
                  }))
                }
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
              >
                <option value="">Select space</option>
                {scopedDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={form.role}
                disabled={role !== 'super_admin'}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
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
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
              >
                <option value="">Assigned pastor (optional)</option>
                {pastors
                  .filter((pastor) => pastor.department_id === form.departmentId)
                  .map((pastor) => (
                    <option key={pastor.id} value={pastor.id}>
                      {pastor.name}
                    </option>
                  ))}
              </select>
              <textarea
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="Optional welcome message"
                rows={4}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] md:col-span-2"
              />
              <button
                type="submit"
                disabled={saving || !canManage}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2"
              >
                Send Invitation
              </button>
            </form>
          </div>

          <div className="space-y-4 rounded-[22px] border border-[var(--border)] bg-white p-5">
            <div>
              <div className="text-base font-semibold text-[var(--text-primary)]">Bulk import</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                CSV columns: First Name, Last Name, Email, Department, Role, Pastor Email
              </div>
            </div>

            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFile}
              className="block w-full text-sm text-[var(--text-secondary)]"
            />

            {csvRows.length > 0 ? (
              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                Parsed {csvRows.length} rows and ready to import.
              </div>
            ) : null}

            <button
              type="button"
              disabled={saving || csvRows.length === 0 || !canManage}
              onClick={handleImport}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
            >
              Import CSV
            </button>

            {importReport ? (
              <div className="rounded-2xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                Created: {importReport.created} · Skipped: {importReport.skipped} · Failed: {importReport.failed}
              </div>
            ) : null}

            {latestLink ? (
              <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">Latest activation link</div>
                <div className="mt-1 break-all">{latestLink}</div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Pending & recent invitations</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {summary.pending} pending · {summary.accepted} accepted · {summary.expired} expired
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[22px] border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-secondary)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-4">Email</th>
                <th className="px-4 py-4">Role</th>
                <th className="px-4 py-4">Space</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {scopedInvitations.map((invitation) => {
                const department = departmentById.get(invitation.department_id)
                const invitedBy = userById.get(invitation.invited_by)
                const roleBadge = roleTone(invitation.role)
                const statusBadge = statusTone(invitation.status)
                const canResend = canManage && ['pending', 'expired'].includes(invitation.status)
                const canRevoke = canManage && invitation.status === 'pending'

                return (
                  <tr key={invitation.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-[var(--text-primary)]">{invitation.email}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        Invited by {invitedBy?.name ?? 'Unknown'} · {formatRelativeTime(invitation.created_at)}
                      </div>
                      {invitation.invite_message ? (
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{invitation.invite_message}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ background: roleBadge.bg, color: roleBadge.text }}
                      >
                        {ROLE_LABELS[invitation.role] ?? invitation.role}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-[var(--text-primary)]">
                        <DepartmentGlyph department={department} />
                        <span>{department?.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={{ background: statusBadge.bg, color: statusBadge.text, borderColor: statusBadge.border }}
                      >
                        {invitation.status === 'pending' ? 'Pending' : invitation.status === 'accepted' ? 'Accepted' : invitation.status === 'expired' ? 'Expired' : 'Revoked'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {canResend ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSend(invitation.id, 'resend')}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] disabled:opacity-60"
                          >
                            Resend
                          </button>
                        ) : null}
                        {canRevoke ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true)
                              setError('')
                              try {
                                await cancelInvitation(invitation.id)
                                await loadData()
                              } catch (nextError) {
                                setError(nextError.message)
                              } finally {
                                setSaving(false)
                              }
                            }}
                            className="rounded-lg border border-[#F3B6A8] px-3 py-1.5 text-xs font-semibold text-[#C94830] disabled:opacity-60"
                          >
                            Revoke
                          </button>
                        ) : null}
                        {canManage && invitation.status === 'pending' ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleCopyLink(invitation.id)}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-60"
                          >
                            Copy link
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!loading && scopedInvitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-secondary)]">
                    No invitation records available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </PeopleLayout>
  )
}
