import { useEffect, useState } from 'react'
import { createSprintTeam, deleteSprintTeam, getActiveUsers, updateSprintTeam } from '../../lib/sprints'

export default function SprintTeamPanel({ sprintId, teams, members, canEdit, isArchived, onChanged }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leadUserId, setLeadUserId] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [editingLeadUserId, setEditingLeadUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    async function loadUsers() {
      try {
        const users = await getActiveUsers()
        setAllUsers(users)
      } catch (error) {
        console.error('Failed to load users:', error)
      } finally {
        setLoadingUsers(false)
      }
    }
    loadUsers()
  }, [])

  const memberCountFor = (teamId) =>
    members.filter((member) => (member.sprint_team_ids ?? []).includes(teamId)).length

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await createSprintTeam(sprintId, name.trim(), description.trim() || null, leadUserId || null)
      setName('')
      setDescription('')
      setLeadUserId('')
      await onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(teamId) {
    await updateSprintTeam(teamId, {
      name: editingName.trim(),
      description: editingDescription.trim() || null,
      lead_user_id: editingLeadUserId || null,
    })
    setEditingId(null)
    await onChanged?.()
  }

  async function handleDelete(teamId) {
    await deleteSprintTeam(teamId)
    await onChanged?.()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4">
          <div className="text-lg font-semibold text-[var(--text-primary)]">Sprint Teams</div>
          <div className="text-sm text-[var(--text-secondary)]">Optional sub-groups inside the sprint.</div>
        </div>

        <div className="space-y-3">
          {teams.map((team) => {
            const isEditing = editingId === team.id
            return (
              <div key={team.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
                    />
                    <textarea
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
                    />
                    <select
                      value={editingLeadUserId}
                      onChange={(e) => setEditingLeadUserId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">No lead assigned</option>
                      {allUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleSaveEdit(team.id)} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{team.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">{team.description || 'No description'}</div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                        Lead: {team.lead?.name ?? 'Unassigned'}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)]">{memberCountFor(team.id)} members</div>
                    {canEdit && !isArchived ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(team.id)
                            setEditingName(team.name)
                            setEditingDescription(team.description ?? '')
                            setEditingLeadUserId(team.lead_user_id ?? '')
                          }}
                          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(team.id)}
                          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}

          {teams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              No sprint teams yet.
            </div>
          ) : null}
        </div>
      </div>

      {canEdit && !isArchived ? (
        <form onSubmit={handleAdd} className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Add team</div>
          <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
            />
            <select
              value={leadUserId}
              onChange={(e) => setLeadUserId(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
              disabled={loadingUsers}
            >
              <option value="">{loadingUsers ? 'Loading users...' : 'No lead assigned'}</option>
              {allUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!name.trim() || saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Adding…' : 'Add team'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
