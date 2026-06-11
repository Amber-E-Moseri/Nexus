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
  updateInvitationExpiry,
} from '../../lib/people/api'
import { parseInvitationCsv } from '../../lib/people/csv'

const STATUS_FILTERS = ['all', 'pending', 'accepted', 'expired', 'revoked']

const DELIVERY_TONES = {
  pending: 'bg-violet-50 text-violet-700',
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  activated: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-600',
  expired: 'bg-amber-50 text-amber-700',
}

function formatDate(value, withTime = false) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-CA', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function DeliveryBadge({ status }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${DELIVERY_TONES[status] ?? DELIVERY_TONES.pending}`}
    >
      {status}
    </span>
  )
}

export default function InvitationsPage() {
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
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

  const pastors = useMemo(() => {
    return users.filter((user) => {
      if (user.role !== 'pastor') return false
      if (role === 'dept_lead') return user.department_id === profile?.department_id
      return true
    })
  }, [profile?.department_id, role, users])

  const scopedInvitations = useMemo(() => {
    const base =
      role === 'dept_lead'
        ? invitations.filter((invitation) => invitation.department_id === profile?.department_id)
        : invitations

    if (statusFilter === 'all') {
      return base
    }

    return base.filter((invitation) => invitation.status === statusFilter)
  }, [invitations, profile?.department_id, role, statusFilter])

  const pendingCount = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'pending').length,
    [invitations],
  )

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

  const handleExpiryChange = async (invitationId, currentValue) => {
    const nextValue = window.prompt(
      'Enter a new expiry date and time in ISO format, for example 2026-06-17T17:00:00Z',
      currentValue ?? '',
    )

    if (!nextValue) return

    setSaving(true)
    setError('')

    try {
      await updateInvitationExpiry(invitationId, nextValue)
      await loadData()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PeopleLayout
      title="Invitations"
      description="Create, resend, revoke, and monitor onboarding invitations without exposing auth or email secrets to the client."
    >
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Create invitation</h2>
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
              <option value="">Select department</option>
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
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
            >
              Send Invitation
            </button>
          </form>

          {latestLink ? (
            <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <div className="font-medium text-[var(--text-primary)]">Latest activation link</div>
              <div className="mt-1 break-all">{latestLink}</div>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Bulk import</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              CSV columns: First Name, Last Name, Email, Department, Role, Pastor Email
            </p>
          </div>

          <input
            type="file"
            accept=".csv"
            onChange={handleCsvFile}
            className="block w-full text-sm text-[var(--text-secondary)]"
          />

          {csvRows.length > 0 ? (
            <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Parsed {csvRows.length} rows and ready to create invitation records.
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving || csvRows.length === 0 || !canManage}
            onClick={handleImport}
            className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Import CSV
          </button>

          {importReport ? (
            <div className="rounded-2xl border border-[var(--border)] p-4">
              <div className="text-sm font-semibold text-[var(--text-primary)]">Import report</div>
              <div className="mt-2 grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
                <div>Created: {importReport.created}</div>
                <div>Skipped: {importReport.skipped}</div>
                <div>Failed: {importReport.failed}</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Invitation management</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Review invite status, delivery attempts, and secure activation links.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  statusFilter === status
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {status === 'all' ? `All (${invitations.length})` : `${status} (${invitations.filter((item) => item.status === status).length})`}
              </button>
            ))}
            <span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
              {pendingCount} pending
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-3 py-3 font-medium">Invitee</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Department</th>
                <th className="px-3 py-3 font-medium">Invite Status</th>
                <th className="px-3 py-3 font-medium">Delivery</th>
                <th className="px-3 py-3 font-medium">Last Sent</th>
                <th className="px-3 py-3 font-medium">Send Count</th>
                <th className="px-3 py-3 font-medium">Expires</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scopedInvitations.map((invitation) => {
                const department = departments.find((entry) => entry.id === invitation.department_id)
                const canDeliver = canManage && invitation.status === 'pending'
                const canRetry = canDeliver && ['pending', 'failed', 'sent'].includes(invitation.delivery_status)

                return (
                  <tr key={invitation.id} className="border-b border-[var(--border)]/60 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {invitation.first_name} {invitation.last_name}
                      </div>
                      <div className="text-[var(--text-secondary)]">{invitation.email}</div>
                      {invitation.invite_message ? (
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{invitation.invite_message}</div>
                      ) : null}
                      {invitation.delivery_error ? (
                        <div className="mt-1 text-xs text-red-600">{invitation.delivery_error}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{invitation.role}</td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{department?.name ?? '—'}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
                        {invitation.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <DeliveryBadge status={invitation.delivery_status} />
                    </td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(invitation.last_sent_at, true)}</td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{invitation.send_count ?? 0}</td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDate(invitation.expires_at, true)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving || !canDeliver}
                          onClick={() => handleSend(invitation.id, 'send')}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          disabled={saving || !canRetry}
                          onClick={() => handleSend(invitation.id, 'resend')}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          disabled={saving || invitation.status !== 'pending' || !canManage}
                          onClick={() => handleCopyLink(invitation.id)}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          disabled={saving || !canManage}
                          onClick={() => handleExpiryChange(invitation.id, invitation.expires_at)}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          Change expiry
                        </button>
                        <button
                          type="button"
                          disabled={saving || invitation.status !== 'pending' || !canManage}
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
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!loading && scopedInvitations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                    No invitation records available for this filter.
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
