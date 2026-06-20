import { useState, useEffect } from 'react'
import { getAllSprints, assignTeamToSprint, unassignTeamFromSprint } from '../lib/sprints'

export default function AssignTeamToSprintModal({ team, onClose, onSuccess }) {
  const [selectedSprintId, setSelectedSprintId] = useState(team?.sprint_id || null)
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSprints()
  }, [])

  async function loadSprints() {
    try {
      setLoading(true)
      const data = await getAllSprints()
      setSprints(data.filter((s) => !s.is_archived))
    } catch (err) {
      console.error('Failed to load sprints:', err)
      alert('Failed to load sprints')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign() {
    setSaving(true)
    try {
      if (selectedSprintId) {
        await assignTeamToSprint(team.id, selectedSprintId)
      } else if (team.sprint_id) {
        await unassignTeamFromSprint(team.id)
      }
      await onSuccess?.()
      onClose?.()
    } catch (err) {
      alert(`Failed to assign team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px' }}>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>
          {team?.sprint_id ? 'Change Sprint' : 'Assign to Sprint'}
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Select Sprint
          </label>
          <select
            value={selectedSprintId || ''}
            onChange={(e) => setSelectedSprintId(e.target.value || null)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          >
            <option value="">None (Keep Independent)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 16px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'white',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || selectedSprintId === team?.sprint_id}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background:
                saving || selectedSprintId === team?.sprint_id
                  ? 'var(--text-tertiary)'
                  : '#4C2A92',
              color: 'white',
              cursor: saving || selectedSprintId === team?.sprint_id ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
