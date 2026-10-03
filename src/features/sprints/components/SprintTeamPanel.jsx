import { useEffect, useRef, useState } from 'react'
import { Pencil, Crown, Trash2, Plus } from 'lucide-react'
import { addSprintTeamMembership, removeSprintTeamMembership, updateSprintTeam, deleteSprintTeam, getActiveUsers, addSprintMember } from '../lib/sprints'

const TEAM_COLORS = ['#5B34C7', '#1C87BE', '#E8A020', '#C94830', '#4A8F6C', '#A0522D', '#8B008B']

const AVATAR_COLORS = [
  '#E8A020', '#5B34C7', '#1C87BE', '#C94830', '#4A8F6C',
  '#A0522D', '#2E8B57', '#8B008B', '#4682B4', '#CD853F',
]

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2)
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
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!canEdit || isArchived) return
    getActiveUsers().then(setOrgUsers).catch(() => setOrgUsers([]))
  }, [canEdit, isArchived])

  useEffect(() => {
    if (!openDropdown) return
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown])

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
    const baseStyle = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.55, cursor: canEdit && !isArchived ? 'text' : 'default' }

    return (
      <div style={{ marginBottom: 10 }}>
        {isList ? (
          <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc' }}
            onClick={() => canEdit && !isArchived && (setEditingDescId(team.id), setEditingDesc(team.description || ''))}>
            {visibleLines.map((line, i) => <li key={i} style={baseStyle}>{line}</li>)}
          </ul>
        ) : (
          <p style={baseStyle} onClick={() => canEdit && !isArchived && (setEditingDescId(team.id), setEditingDesc(team.description || ''))}>
            {visibleLines[0]}
          </p>
        )}
        {needsTruncation && (
          <button type="button" onClick={() => toggleDesc(team.id)}
            style={{ background: 'none', border: 'none', padding: '2px 0 0', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
            {isExpanded ? '▲ Show less' : `▼ Show ${lines.length - PREVIEW_LINES} more`}
          </button>
        )}
      </div>
    )
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return
    setSaving(true)
    try {
      await onCreateTeam?.(newTeamName.trim())
      setNewTeamName('')
      await onTeamChanged?.()
    } catch (err) {
      alert(`Failed to create team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const getTeamMembers = (teamId) => members.filter((m) => (m.sprint_team_ids ?? []).includes(teamId))

  async function handleRemoveFromTeam(teamId, member) {
    setSaving(true)
    try {
      await removeSprintTeamMembership(sprintId, teamId, member.user_id)
      await onTeamChanged?.()
    } catch (err) {
      alert(`Failed to remove from team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(teamId, member) {
    setSaving(true)
    try {
      if (member.isNonSprintUser) {
        await addSprintMember(sprintId, member.user_id, 'contributor', [teamId], null)
      } else {
        await addSprintTeamMembership(sprintId, teamId, member.user_id)
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
    if (!window.confirm('Delete this team? Members will remain in the sprint.')) return
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
      {/* Create team row */}
      {canEdit && !isArchived && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            ref={inputRef}
            id="new-team-input"
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            placeholder="New team name — e.g. Curriculum, Logistics…"
            style={{
              flex: 1,
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 14px',
              fontSize: 13,
              color: 'var(--text-primary)',
              background: '#fff',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          <button
            type="button"
            onClick={handleCreateTeam}
            disabled={saving || !newTeamName.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: newTeamName.trim() && !saving ? 'pointer' : 'not-allowed',
              opacity: !newTeamName.trim() || saving ? 0.45 : 1,
              whiteSpace: 'nowrap',
              transition: 'opacity 0.12s',
            }}
          >
            <Plus size={14} />
            {saving ? 'Creating…' : 'Create team'}
          </button>
        </div>
      )}

      {/* Empty state */}
      {teams.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏃</div>
          <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>No teams yet</div>
          <div>{canEdit ? 'Name a team above and hit Enter to create it.' : 'No teams have been created for this sprint.'}</div>
        </div>
      )}

      {/* Team cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
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
                borderLeft: `4px solid ${teamColor}`,
                background: '#FAFAF8',
                padding: '14px 16px',
                boxShadow: '0 1px 4px rgba(28,22,16,0.05)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(28,22,16,0.09)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(28,22,16,0.05)' }}
            >
              {/* Team header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, border: '1px solid var(--accent)', borderRadius: 6, padding: '3px 7px', color: 'var(--text-primary)', background: '#fff', outline: 'none' }}
                  />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flex: 1, letterSpacing: '-0.01em' }}>
                    {team.name}
                  </span>
                )}

                {/* Member count */}
                <span style={{ fontSize: 11, fontWeight: 600, color: teamColor, background: `${teamColor}14`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', border: `1px solid ${teamColor}25` }}>
                  {teamMembers.length}
                </span>

                {canEdit && !isArchived && !isEditing && (
                  <button
                    type="button"
                    onClick={() => { setEditingTeamId(team.id); setEditingName(team.name) }}
                    title="Rename"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)', display: 'flex', borderRadius: 4, transition: 'color 0.1s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                  >
                    <Pencil size={13} />
                  </button>
                )}

                {canEdit && !isArchived && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={saving}
                    title="Delete team"
                    style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: 2, color: 'var(--text-tertiary)', display: 'flex', borderRadius: 4, opacity: saving ? 0.4 : 1, transition: 'color 0.1s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#C94830' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Lead badge */}
              {team.lead_user_id && (() => {
                const lead = members.find((m) => m.user_id === team.lead_user_id)
                return lead ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <Crown size={11} color="var(--accent)" fill="var(--accent)" />
                    <span>Lead: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{lead.user?.name}</strong></span>
                  </div>
                ) : null
              })()}

              {/* Description */}
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
                  style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontFamily: 'inherit', lineHeight: 1.5, resize: 'none', background: '#fff', marginBottom: 10, boxSizing: 'border-box', outline: 'none' }}
                />
              ) : team.description ? (
                renderDescription(team)
              ) : canEdit && !isArchived ? (
                <button
                  type="button"
                  onClick={() => { setEditingDescId(team.id); setEditingDesc('') }}
                  style={{ background: 'none', border: 'none', padding: '0 0 10px', fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', textAlign: 'left' }}
                >
                  + Add description
                </button>
              ) : null}

              {/* Divider before members */}
              {teamMembers.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginBottom: 10 }} />
              )}

              {/* Members */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {teamMembers.map((member) => (
                  <div
                    key={member.user_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: team.lead_user_id === member.user_id ? `${teamColor}12` : '#fff',
                      border: `1px solid ${team.lead_user_id === member.user_id ? teamColor + '40' : 'var(--border)'}`,
                      borderRadius: 999,
                      padding: '4px 10px 4px 5px',
                      transition: 'background 0.12s',
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
                      style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(member.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}
                    >
                      {getInitials(member.user?.name)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {member.user?.name || '?'}
                    </span>
                    {canEdit && !isArchived && (
                      <>
                        <button
                          type="button"
                          data-lead-btn
                          title="Make team lead"
                          onClick={async () => {
                            setSaving(true)
                            try {
                              await updateSprintTeam(team.id, { lead_user_id: team.lead_user_id === member.user_id ? null : member.user_id })
                              await onTeamChanged?.()
                            } catch (err) {
                              alert(`Failed to update lead: ${err?.message || String(err)}`)
                            } finally {
                              setSaving(false)
                            }
                          }}
                          disabled={saving}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: team.lead_user_id === member.user_id ? 1 : 0, transition: 'opacity 0.15s' }}
                        >
                          <Crown size={13} color={team.lead_user_id === member.user_id ? teamColor : 'var(--text-tertiary)'} fill={team.lead_user_id === member.user_id ? teamColor : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromTeam(team.id, member)}
                          disabled={saving}
                          title={`Remove ${member.user?.name} from this team`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1, opacity: saving ? 0.4 : 0.6, marginLeft: 1 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#C94830'; e.currentTarget.style.opacity = '1' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.opacity = '0.6' }}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {canEdit && !isArchived && (
                  <div style={{ position: 'relative' }} ref={openDropdown === team.id ? dropdownRef : null}>
                    <button
                      type="button"
                      onClick={() => { setOpenDropdown(openDropdown === team.id ? null : team.id); setMemberSearch('') }}
                      disabled={saving || availableMembers.length === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none',
                        border: '1px dashed var(--border)',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text-tertiary)',
                        cursor: availableMembers.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: availableMembers.length === 0 ? 0.4 : 1,
                        transition: 'border-color 0.12s, color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (availableMembers.length > 0) {
                          e.currentTarget.style.borderColor = 'var(--accent)'
                          e.currentTarget.style.color = 'var(--accent)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--text-tertiary)'
                      }}
                    >
                      <Plus size={12} />
                      Add
                    </button>

                    {openDropdown === team.id && availableMembers.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.10)', zIndex: 30, minWidth: 220, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search members…"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)', background: 'var(--surface-secondary, #F9F7F1)', boxSizing: 'border-box', outline: 'none' }}
                          />
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {(() => {
                            const q = memberSearch.toLowerCase()
                            const filteredSprint = sprintMembersNotInTeam.filter((m) => (m.user?.name || '').toLowerCase().includes(q))
                            const filteredNonSprint = nonSprintUsers.filter((m) => (m.user?.name || '').toLowerCase().includes(q))
                            return (
                              <>
                                {filteredSprint.length > 0 && (
                                  <>
                                    {filteredNonSprint.length > 0 && (
                                      <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sprint members</div>
                                    )}
                                    {filteredSprint.map((member) => (
                                      <button key={member.user_id} type="button" onClick={() => handleAddMember(team.id, member)} disabled={saving}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                      >
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(member.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                          {getInitials(member.user?.name)}
                                        </div>
                                        {member.user?.name}
                                      </button>
                                    ))}
                                  </>
                                )}
                                {filteredNonSprint.length > 0 && (
                                  <>
                                    <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: filteredSprint.length > 0 ? '1px solid var(--border)' : 'none', marginTop: filteredSprint.length > 0 ? 4 : 0 }}>
                                      Add to sprint
                                    </div>
                                    {filteredNonSprint.map((member) => (
                                      <button key={member.user_id} type="button" onClick={() => handleAddMember(team.id, member)} disabled={saving}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                      >
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(member.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                          {getInitials(member.user?.name)}
                                        </div>
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
