import { useEffect, useMemo, useState } from 'react'
import PeopleLayout from './PeopleLayout'
import { useAuth } from '../../hooks/useAuth'
import {
  listDepartmentAssignmentHistory,
  listDepartments,
  listUsers,
  updateUserMembership,
} from '../../lib/people/api'
import { selectDepartmentUsers } from '../../lib/people/selectors'

export default function DepartmentsPage() {
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [history, setHistory] = useState([])
  const [transfer, setTransfer] = useState({
    userId: '',
    departmentId: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextDepartments, nextUsers, nextHistory] = await Promise.all([
        listDepartments(),
        listUsers(),
        listDepartmentAssignmentHistory(),
      ])
      setDepartments(nextDepartments)
      setUsers(nextUsers)
      setHistory(nextHistory)
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
    return users
  }, [profile?.department_id, role, users])

  const scopedDepartments = useMemo(() => {
    if (role === 'dept_lead') {
      return departments.filter((department) => department.id === profile?.department_id)
    }
    return departments
  }, [departments, profile?.department_id, role])

  const departmentCounts = useMemo(() => {
    const counts = new Map()
    scopedUsers.forEach((user) => {
      counts.set(user.department_id, (counts.get(user.department_id) ?? 0) + 1)
    })
    return counts
  }, [scopedUsers])

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )

  const movableUsers = scopedUsers.filter((user) => role === 'super_admin' || user.role === 'member')

  const canTransfer = role === 'super_admin' || role === 'dept_lead'

  return (
    <PeopleLayout
      title="Departments"
      description="Review current membership counts and move users without losing historical work."
    >
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Department roster</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Historical tasks, attendance, and activity remain tied to the original records.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {scopedDepartments.map((department) => (
              <div key={department.id} className="rounded-2xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-[var(--text-primary)]">{department.name}</div>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: `#${department.color}` }}
                  />
                </div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  {departmentCounts.get(department.id) ?? 0}
                </div>
                <div className="text-sm text-[var(--text-secondary)]">Users currently assigned</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Move user</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Reassignment updates future department access while leaving historical records intact.
          </p>

          <div className="grid gap-3">
            <select
              value={transfer.userId}
              onChange={(event) => setTransfer((current) => ({ ...current, userId: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select user</option>
              {movableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>

            <select
              value={transfer.departmentId}
              onChange={(event) => setTransfer((current) => ({ ...current, departmentId: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select new department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!canTransfer || saving || !transfer.userId || !transfer.departmentId}
              onClick={async () => {
                setSaving(true)
                setError('')
                try {
                  await updateUserMembership({
                    userId: transfer.userId,
                    departmentId: transfer.departmentId,
                    reason: 'Department reassignment from People module',
                  })
                  setTransfer({ userId: '', departmentId: '' })
                  await loadData()
                } catch (nextError) {
                  setError(nextError.message)
                } finally {
                  setSaving(false)
                }
              }}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Transfer user
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Reassignment history</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Each transfer is recorded so lifecycle changes remain auditable.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-3 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">From</th>
                <th className="px-3 py-3 font-medium">To</th>
                <th className="px-3 py-3 font-medium">Changed By</th>
                <th className="px-3 py-3 font-medium">Effective</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--border)]/60">
                  <td className="px-3 py-3 text-[var(--text-primary)]">
                    {userById.get(entry.user_id)?.name ?? 'Unknown user'}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {departmentById.get(entry.from_department_id)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {departmentById.get(entry.to_department_id)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {userById.get(entry.changed_by)?.name ?? 'Unknown user'}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {new Date(entry.effective_at).toLocaleDateString('en-CA')}
                  </td>
                </tr>
              ))}

              {!loading && history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                    No department transfers have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PeopleLayout>
  )
}
