import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { createNotification } from '../../lib/notifications'
import Badge from '../../components/ui/Badge'
import {
  addSprintMember,
  getActiveUsers,
  removeSprintMember,
  updateSprintMemberRole,
  updateSprintMemberTeams,
} from '../../lib/sprints'

const ROLE_OPTIONS = ['owner', 'manager', 'contributor', 'viewer']

function selectedValuesFromOptions(options) {
  return Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value)
}

function badgeToneForRole(role) {
  if (role === 'owner') return 'completed'
  if (role === 'manager') return 'active'
  if (role === 'viewer') return 'archived'
  return 'planning'
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {title}
      </div>
      <div>{subtitle}</div>
    </div>
  )
}

export default function SprintMemberPanel({
  sprintId,
  sprintName,
  members,
  teams,
  canEdit,
  isArchived,
  onChanged,
}) {
  const { profile } = useAuth()
  const [orgUsers, setOrgUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('contributor')
  const [selectedTeamIds, setSelectedTeamIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (!canEdit || isArchived) return
    setLoadingUsers(true)
    getActiveUsers().then(setOrgUsers).catch(() => setOrgUsers([])).finally(() => setLoadingUsers(false))
  }, [canEdit, isArchived])

  const existingUserIds = useMemo(() => new Set(members.map((member) => member.user?.id)), [members])
  const addableUsers = orgUsers.filter((user) => !existingUserIds.has(user.id))

  async function handleAdd() {
    if (!selectedUserId) return
    setSaving(true)
    try {
      await addSprintMember(sprintId, selectedUserId, selectedRole, selectedTeamIds)
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

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">Sprint Members</div>
            <div className="text-sm text-[var(--text-secondary)]">Cross-functional members assigned to this sprint.</div>
          </div>
          <Badge tone={isArchived ? 'archived' : 'active'}>{members.length} members</Badge>
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.user?.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">{member.user?.name ?? member.user?.email ?? '—'}</div>
                <div className="truncate text-xs text-[var(--text-tertiary)]">{member.user?.email}</div>
              </div>

              {canEdit && !isArchived ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>

                  <select
                    multiple
                    value={member.sprint_team_ids ?? []}
                    onChange={(e) => handleTeamChange(member.user.id, selectedValuesFromOptions(e.target.options))}
                    className="min-w-[180px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleRemove(member.user.id)}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <Badge tone={badgeToneForRole(member.role)}>
                    {member.role}
                  </Badge>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {member.sprint_teams?.length ? member.sprint_teams.map((team) => team.name).join(', ') : 'No team'}
                  </span>
                </>
              )}
            </div>
          ))}

          {members.length === 0 ? (
            <EmptyState icon="👥" title="No members yet" subtitle="Add members to get started" />
          ) : null}
        </div>
      </div>

      {canEdit && !isArchived ? (
        <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Add member</div>
          {loadingUsers ? (
            <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading...
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[1.6fr_0.8fr_1fr_auto]">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
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
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <select
              multiple
              value={selectedTeamIds}
              onChange={(e) => setSelectedTeamIds(selectedValuesFromOptions(e.target.options))}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedUserId || saving}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
