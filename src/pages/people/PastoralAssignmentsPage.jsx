import { useEffect, useMemo, useState } from 'react'
import PeopleLayout from './PeopleLayout'
import { useAuth } from '../../hooks/useAuth'
import {
  assignPastorMember,
  listDepartments,
  listPastorMembers,
  listUsers,
  removePastorMember,
} from '../../lib/people/api'
import { selectDepartmentUsers, selectPastorMembers } from '../../lib/people/selectors'

export default function PastoralAssignmentsPage() {
  const { profile, role } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [assignments, setAssignments] = useState([])
  const [draft, setDraft] = useState({
    pastorId: '',
    memberId: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextUsers, nextDepartments, nextAssignments] = await Promise.all([
        listUsers(),
        listDepartments(),
        listPastorMembers(),
      ])
      setUsers(nextUsers)
      setDepartments(nextDepartments)
      setAssignments(nextAssignments)
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
      const members = selectPastorMembers(users, assignments, profile?.id)
      return [profile, ...members].filter(Boolean).map((entry) => users.find((user) => user.id === entry.id) ?? entry)
    }
    return users
  }, [assignments, profile, role, users])

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )

  const pastors = scopedUsers.filter((user) => user.role === 'pastor')
  const members = scopedUsers.filter((user) => user.role === 'member')

  const visibleAssignments = useMemo(() => {
    if (role === 'pastor') {
      return assignments.filter((assignment) => assignment.pastor_id === profile?.id)
    }
    if (role === 'dept_lead') {
      return assignments.filter((assignment) => {
        const member = userById.get(assignment.member_id)
        return member?.department_id === profile?.department_id
      })
    }
    return assignments
  }, [assignments, profile?.department_id, profile?.id, role, userById])

  const canManageAssignments = role === 'super_admin' || role === 'dept_lead'

  return (
    <PeopleLayout
      title="Pastoral Assignments"
      description="Assign, remove, and transfer member-to-pastor relationships without altering pastoral dashboard permissions."
    >
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1fr]">
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Assign member</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Each member may have only one assigned pastor. Transfers replace the previous assignment.
          </p>

          <div className="grid gap-3">
            <select
              value={draft.pastorId}
              disabled={!canManageAssignments}
              onChange={(event) => setDraft((current) => ({ ...current, pastorId: event.target.value, memberId: '' }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
            >
              <option value="">Select pastor</option>
              {pastors.map((pastor) => (
                <option key={pastor.id} value={pastor.id}>
                  {pastor.name}
                </option>
              ))}
            </select>

            <select
              value={draft.memberId}
              disabled={!canManageAssignments || !draft.pastorId}
              onChange={(event) => setDraft((current) => ({ ...current, memberId: event.target.value }))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-secondary)]"
            >
              <option value="">Select member</option>
              {members
                .filter((member) => member.department_id === userById.get(draft.pastorId)?.department_id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>

            <button
              type="button"
              disabled={!canManageAssignments || saving || !draft.pastorId || !draft.memberId}
              onClick={async () => {
                setSaving(true)
                setError('')
                try {
                  await assignPastorMember(draft.pastorId, draft.memberId)
                  setDraft({ pastorId: '', memberId: '' })
                  await loadData()
                } catch (nextError) {
                  setError(nextError.message)
                } finally {
                  setSaving(false)
                }
              }}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Assign Member
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Current assignments</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Pastors keep many members; members keep a single shepherd assignment.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-3 font-medium">Pastor</th>
                  <th className="px-3 py-3 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">Department</th>
                  <th className="px-3 py-3 font-medium">Assigned</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssignments.map((assignment) => {
                  const pastor = userById.get(assignment.pastor_id)
                  const member = userById.get(assignment.member_id)
                  return (
                    <tr key={`${assignment.pastor_id}-${assignment.member_id}`} className="border-b border-[var(--border)]/60">
                      <td className="px-3 py-3 text-[var(--text-primary)]">{pastor?.name ?? 'Unknown pastor'}</td>
                      <td className="px-3 py-3 text-[var(--text-primary)]">{member?.name ?? 'Unknown member'}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        {departmentById.get(member?.department_id)?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        {new Date(assignment.created_at).toLocaleDateString('en-CA')}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canManageAssignments || saving}
                            onClick={async () => {
                              setSaving(true)
                              setError('')
                              try {
                                await removePastorMember(assignment.member_id)
                                await loadData()
                              } catch (nextError) {
                                setError(nextError.message)
                              } finally {
                                setSaving(false)
                              }
                            }}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                          >
                            Remove Member
                          </button>
                          {canManageAssignments && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  pastorId: assignment.pastor_id,
                                  memberId: assignment.member_id,
                                })
                              }
                              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                            >
                              Transfer Member
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {!loading && visibleAssignments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                      No pastoral assignments are currently visible in your scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PeopleLayout>
  )
}
