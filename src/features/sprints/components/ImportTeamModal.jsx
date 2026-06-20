import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { createTeamFromSpace, getAllSprints } from '../lib/sprints'

export default function ImportTeamModal({ onClose, onSuccess }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [spaces, setSpaces] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      // Load spaces
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('id, title')
        .order('title')
      if (spacesError) throw spacesError

      // Load sprints
      const sprintsData = await getAllSprints()

      setSpaces(spacesData || [])
      setSprints(sprintsData.filter((s) => !s.is_archived))
    } catch (err) {
      console.error('Failed to load data:', err)
      alert('Failed to load spaces or sprints')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!selectedSpaceId) {
      alert('Please select a space')
      return
    }

    setSaving(true)
    try {
      await createTeamFromSpace(selectedSpaceId, selectedSprintId)
      await onSuccess?.()
      onClose?.()
    } catch (err) {
      alert(`Failed to create team from space: ${err?.message || String(err)}`)
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
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Import Team from Space</h2>

        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
          Create a team and automatically add all members from a selected space.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
            Select Space <span style={{ color: 'var(--coral)' }}>*</span>
          </label>
          <select
            value={selectedSpaceId || ''}
            onChange={(e) => setSelectedSpaceId(e.target.value || null)}
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
            <option value="">Choose a space...</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
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
            onClick={handleImport}
            disabled={saving || !selectedSpaceId}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: saving || !selectedSpaceId ? 'var(--text-tertiary)' : '#4C2A92',
              color: 'white',
              cursor: saving || !selectedSpaceId ? 'not-allowed' : 'pointer',
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
