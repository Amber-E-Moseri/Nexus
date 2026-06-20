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

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function PastorGlyph({ user, department }) {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: department?.color ? `#${department.color}` : '#563199' }}
    >
      {getInitials(user?.name)}
    </div>
  )
}

function MemberRow({ member, department, canManageAssignments, saving, onRemove }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: department?.color ? `#${department.color}` : '#6B46C1' }}
        >
          {getInitials(member?.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{member?.name ?? 'Unknown member'}</div>
        </div>
      </div>

      {canManageAssignments ? (
        <button
          type="button"
          disabled={saving}
          onClick={onRemove}
          className="rounded-lg px-2 py-1 text-sm text-[#C9A889] transition hover:bg-[var(--surface-secondary)] disabled:opacity-60"
          aria-label={`Remove ${member?.name ?? 'member'}`}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

export default function PastoralAssignmentsPage() {
  const { profile, role } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [assignments, setAssignments] = useState([])
  const [draftMemberByPastor, setDraftMemberByPastor] = useState({})
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

  const pastors = useMemo(
    () => scopedUsers.filter((user) => user.role === 'pastor').sort((left, right) => left.name.localeCompare(right.name)),
    [scopedUsers],
  )

  const members = useMemo(
    () => scopedUsers.filter((user) => user.role === 'member').sort((left, right) => left.name.localeCompare(right.name)),
    [scopedUsers],
  )

  const membersByPastor = useMemo(() => {
    const map = new Map()

    for (const pastor of pastors) {
      map.set(pastor.id, [])
    }

    for (const assignment of visibleAssignments) {
      const member = userById.get(assignment.member_id)
      if (!member) continue
      const current = map.get(assignment.pastor_id) ?? []
      current.push(member)
      map.set(assignment.pastor_id, current)
    }

    for (const [pastorId, assignedMembers] of map.entries()) {
      assignedMembers.sort((left, right) => left.name.localeCompare(right.name))
      map.set(pastorId, assignedMembers)
    }

    return map
  }, [pastors, userById, visibleAssignments])

  const assignedMemberIds = useMemo(
    () => new Set(visibleAssignments.map((assignment) => assignment.member_id)),
    [visibleAssignments],
  )

  async function handleAssign(pastorId) {
    const memberId = draftMemberByPastor[pastorId]
    if (!memberId) return

    setSaving(true)
    setError('')
    try {
      await assignPastorMember(pastorId, memberId)
      setDraftMemberByPastor((current) => ({ ...current, [pastorId]: '' }))
      await loadData()
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
    >
      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Pastoral</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Pastors and the members under their shepherding care.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {pastors.map((pastor) => {
            const department = departmentById.get(pastor.department_id)
            const assignedMembers = membersByPastor.get(pastor.id) ?? []
            const availableMembers = members.filter((member) => {
              return !assignedMemberIds.has(member.id) || assignedMembers.some((assigned) => assigned.id === member.id)
            })

            return (
              <div key={pastor.id} className="rounded-[22px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PastorGlyph user={pastor} department={department} />
                    <div>
                      <div className="text-lg font-semibold text-[var(--text-primary)]">{pastor.name}</div>
                      <div className="text-sm text-[var(--text-secondary)]">
                        Pastor · {department?.name ?? 'Unassigned'}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#EFE7FF] px-3 py-1 text-xs font-semibold text-[#6B3FD4]">
                    {assignedMembers.length} member{assignedMembers.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {assignedMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      department={department}
                      canManageAssignments={canManageAssignments}
                      saving={saving}
                      onRemove={async () => {
                        setSaving(true)
                        setError('')
                        try {
                          await removePastorMember(member.id)
                          await loadData()
                        } catch (nextError) {
                          setError(nextError.message)
                        } finally {
                          setSaving(false)
                        }
                      }}
                    />
                  ))}

                  {canManageAssignments ? (
                    <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={draftMemberByPastor[pastor.id] ?? ''}
                          onChange={(event) =>
                            setDraftMemberByPastor((current) => ({
                              ...current,
                              [pastor.id]: event.target.value,
                            }))
                          }
                          className="min-w-[220px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">Assign member</option>
                          {availableMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={saving || !draftMemberByPastor[pastor.id]}
                          onClick={() => handleAssign(pastor.id)}
                          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-60"
                        >
                          + Assign member
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}

          {!loading && pastors.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
              No pastors are visible in your current scope.
            </div>
          ) : null}
        </div>
      </section>
    </PeopleLayout>
  )
}
