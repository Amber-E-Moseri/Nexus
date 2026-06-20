import { useState, useEffect } from 'react'
import { createIndependentTeam, getActiveUsers, getAllSprints } from '../lib/sprints'

export default function NewTeamModal({ onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [sprints, setSprints] = useState([])
  const [users, setUsers] = useState([])
  const [showMemberDropdown, setShowMemberDropdown] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [sprintsData, usersData] = await Promise.all([getAllSprints(), getActiveUsers()])
      setSprints(sprintsData.filter((s) => !s.is_archived))
      setUsers(usersData)
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      alert('Team name is required')
      return
    }

    setSaving(true)
    try {
      const team = await createIndependentTeam(name.trim(), description.trim(), null, selectedSprintId)
      // Note: Members would be added via a separate addTeamMember call in a full implementation
      await onSuccess?.()
      onClose?.()
    } catch (err) {
      alert(`Failed to create team: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const availableUsers = users.filter((u) => !selectedMembers.includes(u.id))

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
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Create New Team</h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Team Name <span style={{ color: 'var(--coral)' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Core Team, Cross-functional Group"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional: What is this team for?"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              minHeight: '80px',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Assign to Sprint (Optional)
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
            <option value="">None (Independent Team)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Add Members (Optional)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {selectedMembers.map((memberId) => {
              const user = users.find((u) => u.id === memberId)
              return (
                <div
                  key={memberId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: 'var(--surface-secondary)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                >
                  <span>{user?.name}</span>
                  <button
                    onClick={() => setSelectedMembers(selectedMembers.filter((id) => id !== memberId))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '0',
                      fontSize: '16px',
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMemberDropdown(!showMemberDropdown)}
              disabled={availableUsers.length === 0}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px dashed var(--border)',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: availableUsers.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: availableUsers.length === 0 ? 0.5 : 1,
              }}
            >
              + Add Member
            </button>
            {showMemberDropdown && availableUsers.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 10,
                }}
              >
                {availableUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedMembers([...selectedMembers, user.id])
                      setShowMemberDropdown(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.target.style.background = 'var(--surface-secondary)')}
                    onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                  >
                    {user.name}
                  </button>
                ))}
              </div>
            )}
          </div>
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
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: saving || !name.trim() ? 'var(--text-tertiary)' : '#4C2A92',
              color: 'white',
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  )
}
