import { useState, useRef, useEffect } from 'react'
import { removeSprintMember, updateSprintMemberTeams, updateSprintTeam, deleteSprintTeam } from '../../lib/sprints'

export default function SprintTeamPanel({ sprintId, teams, members, canEdit, isArchived, onChanged }) {
  const [saving, setSaving] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [openDropdown, setOpenDropdown] = useState(null)

  const getTeamColor = (index) => {
    const colors = ['#5B34C7', '#1C87BE', '#E8A020', '#C94830', '#4A8F6C']
    return colors[index % colors.length]
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  const getTeamMembers = (teamId) => {
    return members.filter((member) => (member.sprint_team_ids ?? []).includes(teamId))
  }

  async function handleRemoveMember(member, teamId) {
    if (!window.confirm(`Remove ${member.user?.name} from this team?`)) return
    setSaving(true)
    try {
      const newTeamIds = (member.sprint_team_ids ?? []).filter((id) => id !== teamId)
      await updateSprintMemberTeams(sprintId, member.user_id, newTeamIds)
      await onChanged?.()
    } catch (err) {
      alert(`Failed to remove member: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(teamId, member) {
    setSaving(true)
    try {
      const newTeamIds = [...(member.sprint_team_ids ?? []), teamId]
      await updateSprintMemberTeams(sprintId, member.user_id, newTeamIds)
      setOpenDropdown(null)
      await onChanged?.()
    } catch (err) {
      alert(`Failed to add member: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditTeamName(teamId, newName) {
    if (!newName?.trim()) return
    setSaving(true)
    try {
      await updateSprintTeam(teamId, { name: newName.trim() })
      setEditingTeamId(null)
      await onChanged?.()
    } catch (err) {
      alert(`Failed to update team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTeam(teamId) {
    if (!window.confirm('Delete this team?')) return
    setSaving(true)
    try {
      await deleteSprintTeam(teamId)
      await onChanged?.()
    } catch (err) {
      alert(`Failed to delete team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {teams.map((team, idx) => {
        const teamMembers = getTeamMembers(team.id)
        const teamColor = getTeamColor(idx)
        const availableMembers = members.filter((m) => !(m.sprint_team_ids ?? []).includes(team.id))
        const isEditing = editingTeamId === team.id

        return (
          <div key={team.id} className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div style={{ background: teamColor }} className="h-3 w-3 rounded-full flex-shrink-0" />
                {isEditing ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleEditTeamName(team.id, editingName)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditTeamName(team.id, editingName)
                      if (e.key === 'Escape') setEditingTeamId(null)
                    }}
                    autoFocus
                    className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-sm font-semibold"
                  />
                ) : (
                  <input
                    type="text"
                    value={team.name}
                    onClick={() => {
                      if (canEdit && !isArchived) {
                        setEditingTeamId(team.id)
                        setEditingName(team.name)
                      }
                    }}
                    readOnly={isArchived || !canEdit}
                    className="font-semibold text-[var(--text-primary)] bg-transparent border-b border-transparent hover:border-[var(--border)] cursor-pointer px-1 py-0.5"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--text-tertiary)]">
                  {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
                </span>
                {canEdit && !isArchived && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={saving}
                    className="text-[var(--text-tertiary)] hover:text-[var(--coral)] disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {teamMembers.map((member) => (
                <div key={member.user_id} className="flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-2.5 py-1.5">
                  <div
                    style={{ background: teamColor }}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white flex-shrink-0"
                  >
                    {getInitials(member.user?.name)}
                  </div>
                  <span className="text-xs font-medium text-[var(--text-primary)]">{member.user?.name?.split(' ')[0]}.</span>
                  {canEdit && !isArchived && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member, team.id)}
                      disabled={saving}
                      className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] disabled:opacity-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {canEdit && !isArchived && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === team.id ? null : team.id)}
                    disabled={saving || availableMembers.length === 0}
                    className="text-xs font-medium text-[var(--accent)] disabled:opacity-50"
                  >
                    + Add
                  </button>
                  {openDropdown === team.id && availableMembers.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 rounded-lg border border-[var(--border)] bg-white shadow-lg z-10 min-w-[200px]">
                      {availableMembers.map((member) => (
                        <button
                          key={member.user_id}
                          type="button"
                          onClick={() => handleAddMember(team.id, member)}
                          disabled={saving}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)] disabled:opacity-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {member.user?.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
