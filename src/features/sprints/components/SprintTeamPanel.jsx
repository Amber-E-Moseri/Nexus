import { useEffect, useState } from 'react'
import { Pencil, Crown } from 'lucide-react'
import { removeSprintMember, updateSprintMemberTeams, updateSprintTeam, deleteSprintTeam, getActiveUsers, addSprintMember } from '../lib/sprints'

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

export default function SprintTeamPanel({ sprintId, teams, members, canEdit, isArchived, onCreateTeam, onTeamChanged }) {
  const [saving, setSaving] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [editingTeamId, setEditingTeamId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescId, setEditingDescId] = useState(null)
  const [editingDesc, setEditingDesc] = useState('')
  const [openDropdown, setOpenDropdown] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [orgUsers, setOrgUsers] = useState([])
  const [expandedDescIds, setExpandedDescIds] = useState(new Set())

  function toggleDesc(teamId) {
    setExpandedDescIds((prev) => {
      const next = new Set(prev)
      next.has(teamId) ? next.delete(teamId) : next.add(teamId)
      return next
    })
  }

  function renderDescription(team) {
    const raw = team.description || ''
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const isExpanded = expandedDescIds.has(team.id)
    const PREVIEW_LINES = 3
    const needsTruncation = lines.length > PREVIEW_LINES
    const visibleLines = isExpanded || !needsTruncation ? lines : lines.slice(0, PREVIEW_LINES)
    const isList = lines.length > 1

    const baseStyle = {
      fontSize: 12,
      color: 'var(--text-secondary)',
      margin: '0 0 4px',
      lineHeight: 1.55,
      cursor: canEdit && !isArchived ? 'text' : 'default',
    }

    return (
      <div style={{ marginBottom: 10 }}>
        {isList ? (
          <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc' }}
            onClick={() => canEdit && !isArchived && (setEditingDescId(team.id), setEditingDesc(team.description || ''))}>
            {visibleLines.map((line, i) => (
              <li key={i} style={baseStyle}>{line}</li>
            ))}
          </ul>
        ) : (
          <p style={baseStyle}
            onClick={() => canEdit && !isArchived && (setEditingDescId(team.id), setEditingDesc(team.description || ''))}>
            {visibleLines[0]}
          </p>
        )}
        {needsTruncation && (
          <button
            type="button"
            onClick={() => toggleDesc(team.id)}
            style={{ background: 'none', border: 'none', padding: '2px 0 0', fontSize: 11, color: 'var(--accent, #4C2A92)', cursor: 'pointer', fontWeight: 600 }}
          >
            {isExpanded ? '▲ Show less' : `▼ Show ${lines.length - PREVIEW_LINES} more`}
          </button>
        )}
      </div>
    )
  }

  useEffect(() => {
    if (!canEdit || isArchived) return
    getActiveUsers().then(setOrgUsers).catch(() => setOrgUsers([]))
  }, [canEdit, isArchived])

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return
    setSaving(true)
    try {
      await onCreateTeam?.(newTeamName.trim())
      setNewTeamName('')
    } finally {
      setSaving(false)
    }
  }

  const getTeamMembers = (teamId) =>
    members.filter((m) => (m.sprint_team_ids ?? []).includes(teamId))

  async function handleRemoveMember(member, teamId) {
    if (!window.confirm(`Remove ${member.user?.name} from this team?`)) return
    setSaving(true)
    try {
      await updateSprintMemberTeams(sprintId, member.user_id, (member.sprint_team_ids ?? []).filter((id) => id !== teamId))
      await onTeamChanged?.()
    } catch (err) {
      alert(`Failed to remove member: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(teamId, member) {
    setSaving(true)
    try {
      if (member.isNonSprintUser) {
        // Add to sprint first, then assign to team
        await addSprintMember(sprintId, member.user_id, 'contributor', [teamId], null)
      } else {
        await updateSprintMemberTeams(sprintId, member.user_id, [...(member.sprint_team_ids ?? []), teamId])
      }
      setOpenDropdown(null)
      await onTeamChanged?.()
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
      await onTeamChanged?.()
    } catch (err) {
      alert(`Failed to update team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditTeamDesc(teamId, newDesc) {
    setSaving(true)
    try {
      await updateSprintTeam(teamId, { description: newDesc.trim() || null })
      setEditingDescId(null)
      await onTeamChanged?.()
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
      await onTeamChanged?.()
    } catch (err) {
      alert(`Failed to delete team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {canEdit && !isArchived && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            id="new-team-input"
            placeholder="Team name — e.g. Curriculum, Logistics..."
            style={{
              flex: 1,
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 14px',
              fontSize: 13,
              color: 'var(--text-primary)',
              background: '#fff',
            }}
          />
          <button
            type="button"
            onClick={handleCreateTeam}
            disabled={saving || !newTeamName.trim()}
            style={{
              background: newTeamName.trim() ? 'var(--accent)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: newTeamName.trim() && !saving ? 'pointer' : 'not-allowed',
              opacity: !newTeamName.trim() || saving ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Add team
          </button>
        </div>
      )}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {teams.map((team, idx) => {
        const teamMembers = getTeamMembers(team.id)
        const teamColor = TEAM_COLORS[idx % TEAM_COLORS.length]
        const sprintMemberIds = new Set(members.map((m) => m.user_id))
        const sprintMembersNotInTeam = members.filter((m) => !(m.sprint_team_ids ?? []).includes(team.id))
        const nonSprintUsers = orgUsers
          .filter((u) => !sprintMemberIds.has(u.id))
          .map((u) => ({ user_id: u.id, user: u, sprint_team_ids: [], isNonSprintUser: true }))
        const availableMembers = [...sprintMembersNotInTeam, ...nonSprintUsers]
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-tertiary)', opacity: saving ? 0.4 : 1, fontSize: 14, letterSpacing: 2, lineHeight: 1 }}
                >
                  ▌▌
                </button>
              )}
            </div>

            {/* Goal / description */}
            {editingDescId === team.id ? (
              <textarea
                value={editingDesc}
                onChange={(e) => setEditingDesc(e.target.value)}
                onBlur={() => handleEditTeamDesc(team.id, editingDesc)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditTeamDesc(team.id, editingDesc) }
                  if (e.key === 'Escape') setEditingDescId(null)
                }}
                autoFocus
                placeholder="Describe this team's goal or focus area…"
                rows={2}
                style={{
                  width: '100%',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'none',
                  background: '#fff',
                  marginBottom: 10,
                  boxSizing: 'border-box',
                }}
              />
            ) : team.description ? (
              renderDescription(team)
            ) : canEdit && !isArchived ? (
              <button
                type="button"
                onClick={() => { setEditingDescId(team.id); setEditingDesc('') }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 0 10px',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                + Add goal or description
              </button>
            ) : null}

            {/* Members */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {teamMembers.map((member) => (
                <div
                  key={member.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: team.lead_user_id === member.user_id ? 'rgba(76, 42, 146, 0.08)' : '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '4px 10px 4px 4px',
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget.querySelector('[data-lead-btn]')
                    if (btn) btn.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget.querySelector('[data-lead-btn]')
                    if (btn) btn.style.opacity = '0'
                  }}
                >
                  <div
                    title={member.user?.name}
                    style={{
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
                    cursor: 'pointer',
                  }}>
                    {getInitials(member.user?.name)}
                  </div>
                  <span
                    title={member.user?.name}
                    style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    {member.user?.name || '?'}
                  </span>
                  {canEdit && !isArchived && (
                    <>
                      <button
                        type="button"
                        data-lead-btn
                        onClick={async () => {
                          setSaving(true)
                          try {
                            await updateSprintTeam(team.id, { lead_user_id: member.user_id })
                            await onTeamChanged?.()
                          } catch (err) {
                            alert(`Failed to update team lead: ${err?.message || String(err)}`)
                          } finally {
                            setSaving(false)
                          }
                        }}
                        disabled={saving}
                        title="Make team lead"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                      >
                        <Crown size={14} color={team.lead_user_id === member.user_id ? 'var(--accent)' : 'var(--text-tertiary)'} fill={team.lead_user_id === member.user_id ? 'var(--accent)' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member, team.id)}
                        disabled={saving}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1, marginLeft: 2, opacity: saving ? 0.4 : 1 }}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}

              {canEdit && !isArchived && (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => { setOpenDropdown(openDropdown === team.id ? null : team.id); setMemberSearch('') }}
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
                      minWidth: 220,
                      overflow: 'hidden',
                    }}>
                      {/* Search input */}
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search…"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          style={{
                            width: '100%',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '5px 8px',
                            fontSize: 12,
                            color: 'var(--text-primary)',
                            background: 'var(--surface-secondary, #F9F7F1)',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                      {/* Filtered lists */}
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {(() => {
                          const q = memberSearch.toLowerCase()
                          const filteredSprint = sprintMembersNotInTeam.filter((m) => (m.user?.name || '').toLowerCase().includes(q))
                          const filteredNonSprint = nonSprintUsers.filter((m) => (m.user?.name || '').toLowerCase().includes(q))
                          return (
                            <>
                              {filteredSprint.length > 0 && filteredNonSprint.length > 0 && (
                                <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  Sprint members
                                </div>
                              )}
                              {filteredSprint.map((member) => (
                                <button
                                  key={member.user_id}
                                  type="button"
                                  onClick={() => handleAddMember(team.id, member)}
                                  disabled={saving}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                >
                                  {member.user?.name}
                                </button>
                              ))}
                              {filteredNonSprint.length > 0 && (
                                <>
                                  <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: filteredSprint.length > 0 ? '1px solid var(--border)' : 'none', marginTop: filteredSprint.length > 0 ? 4 : 0 }}>
                                    Add to sprint
                                  </div>
                                  {filteredNonSprint.map((member) => (
                                    <button
                                      key={member.user_id}
                                      type="button"
                                      onClick={() => handleAddMember(team.id, member)}
                                      disabled={saving}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                    >
                                      {member.user?.name}
                                    </button>
                                  ))}
                                </>
                              )}
                              {filteredSprint.length === 0 && filteredNonSprint.length === 0 && (
                                <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>No matches</div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}
