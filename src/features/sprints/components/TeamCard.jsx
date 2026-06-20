import { useState } from 'react'
import { archiveTeam } from '../lib/sprints'
import AssignTeamToSprintModal from './AssignTeamToSprintModal'

export default function TeamCard({ team, onRefresh, onEdit, onAssignToSprint }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)

  const memberCount = team.sprint_team_members?.length || 0

  async function handleArchive() {
    if (!window.confirm('Archive this team? It will be hidden from lists.')) return
    setSaving(true)
    try {
      await archiveTeam(team.id)
      await onRefresh?.()
    } catch (err) {
      alert(`Failed to archive team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        background: 'white',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {team.name}
          </h3>
          {team.description && (
            <p style={{ margin: '0', fontSize: '13px', color: 'var(--text-tertiary)' }}>{team.description}</p>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            marginLeft: '16px',
            flexShrink: 0,
          }}
        >
          <span>
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </span>
          {team.source_space_id && <span style={{ color: '#7A6F5E' }}>from space</span>}
          {team.sprint_id && <span style={{ color: '#4C2A92' }}>in sprint</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {team.sprint_team_members?.map((member) => (
              <div
                key={member.user_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'var(--surface-secondary)',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {member.users?.name || member.users?.email}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onEdit?.(team)}
              disabled={saving}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'white',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
            <button
              onClick={() => setShowAssignModal(true)}
              disabled={saving}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'white',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {team.sprint_id ? 'Change Sprint' : 'Assign to Sprint'}
            </button>
            <button
              onClick={handleArchive}
              disabled={saving}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'white',
                color: 'var(--coral)',
                cursor: 'pointer',
              }}
            >
              Archive
            </button>
          </div>
        </div>
      )}

      {showAssignModal && (
        <AssignTeamToSprintModal
          team={team}
          onClose={() => setShowAssignModal(false)}
          onSuccess={onRefresh}
        />
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          marginTop: '8px',
          padding: '0',
          background: 'transparent',
          border: 'none',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        {expanded ? '− Collapse' : '+ Expand'}
      </button>
    </div>
  )
}
