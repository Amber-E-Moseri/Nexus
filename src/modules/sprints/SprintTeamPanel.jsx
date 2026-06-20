import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { removeSprintMember, updateSprintMemberTeams, updateSprintTeam, deleteSprintTeam } from '../../lib/sprints'

const TEAM_COLORS = ['#5B34C7', '#1C87BE', '#E8A020', '#C94830', '#4A8F6C']

const AVATAR_COLORS = [
  '#E8A020', '#5B34C7', '#1C87BE', '#C94830', '#4A8F6C',
  '#A0522D', '#2E8B57', '#8B008B', '#4682B4', '#CD853F',
]

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

function formatMemberName(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function avatarColor(userId) {
  if (!userId) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function SprintTeamPanel({ sprintId, teams, members, canEdit, isArchived, onChanged }) {
  const [saving, setSaving] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [openDropdown, setOpenDropdown] = useState(null)

  const getTeamMembers = (teamId) =>
    members.filter((m) => (m.sprint_team_ids ?? []).includes(teamId))

  async function handleRemoveMember(member, teamId) {
    if (!window.confirm(`Remove ${member.user?.name} from this team?`)) return
    setSaving(true)
    try {
      await updateSprintMemberTeams(sprintId, member.user_id, (member.sprint_team_ids ?? []).filter((id) => id !== teamId))
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
      await updateSprintMemberTeams(sprintId, member.user_id, [...(member.sprint_team_ids ?? []), teamId])
      setOpenDropdown(null)
      await onChanged?.()
    } catch (err) {
      alert(`Failed to add member: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditTeamName(teamId, newName) {
    if (!newName?.trim()) { setEditingTeamId(null); return }
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {teams.map((team, idx) => {
        const teamMembers = getTeamMembers(team.id)
        const teamColor = TEAM_COLORS[idx % TEAM_COLORS.length]
        const availableMembers = members.filter((m) => !(m.sprint_team_ids ?? []).includes(team.id))
        const isEditing = editingTeamId === team.id

        return (
          <div
            key={team.id}
            style={{
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: '#FAFAF8',
              padding: '14px 16px',
            }}
          >
            {/* Team header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: teamColor, flexShrink: 0 }} />

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
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '2px 6px',
                    color: 'var(--text-primary)',
                    background: '#fff',
                  }}
                />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                  {team.name}
                </span>
              )}

              {canEdit && !isArchived && !isEditing && (
                <button
                  type="button"
                  onClick={() => { setEditingTeamId(team.id); setEditingName(team.name) }}
                  title="Rename team"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)', display: 'flex' }}
                >
                  <Pencil size={13} />
                </button>
              )}

              {/* Member count badge */}
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'var(--accent-light)',
                borderRadius: 999,
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}>
                {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
              </span>

              {canEdit && !isArchived && (
                <button
                  type="button"
                  onClick={() => handleDeleteTeam(team.id)}
                  disabled={saving}
                  title="Delete team"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)', display: 'flex', opacity: saving ? 0.4 : 1 }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Members */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {teamMembers.map((member) => (
                <div
                  key={member.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '4px 10px 4px 4px',
                  }}
                >
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: avatarColor(member.user_id),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}>
                    {getInitials(member.user?.name)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {formatMemberName(member.user?.name)}
                  </span>
                  {canEdit && !isArchived && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member, team.id)}
                      disabled={saving}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1, marginLeft: 2, opacity: saving ? 0.4 : 1 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {canEdit && !isArchived && (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === team.id ? null : team.id)}
                    disabled={saving || availableMembers.length === 0}
                    style={{
                      background: 'none',
                      border: '1px dashed var(--border)',
                      borderRadius: 999,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-tertiary)',
                      cursor: availableMembers.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: availableMembers.length === 0 ? 0.4 : 1,
                    }}
                  >
                    + Add
                  </button>
                  {openDropdown === team.id && availableMembers.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: '#fff',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                      zIndex: 20,
                      minWidth: 180,
                      overflow: 'hidden',
                    }}>
                      {availableMembers.map((member) => (
                        <button
                          key={member.user_id}
                          type="button"
                          onClick={() => handleAddMember(team.id, member)}
                          disabled={saving}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
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
