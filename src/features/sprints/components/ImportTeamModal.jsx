import { useState, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'
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

  function handleOpenSpace(spaceId) {
    window.open(`/spaces/${spaceId}`, '_blank')
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
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'white',
            }}
          >
            {spaces.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No spaces available
              </div>
            ) : (
              spaces.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedSpaceId === s.id ? 'var(--surface-hover)' : 'white',
                  }}
                  onClick={() => setSelectedSpaceId(s.id)}
                >
                  <span style={{ fontSize: '14px', flex: 1 }}>{s.title}</span>
                  <SpaceContextMenu space={s} />
                </div>
              ))
            )}
          </div>
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

function SpaceContextMenu({ space }) {
  const handleSpaceAction = (action) => {
    // Navigate to space page with query parameter for the action
    const queryParam = action === 'view' ? '' : `?action=${action}`
    window.open(`/spaces/${space.id}${queryParam}`, '_blank')
  }

  const menuItems = [
    { icon: '👁️', label: 'View Space', action: 'view' },
    { icon: '⚙', label: 'Statuses', action: 'statuses' },
    { icon: '⚡', label: 'Automations', action: 'automations' },
    { icon: '✏️', label: 'Edit', action: 'edit' },
  ]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
          aria-label="Space options"
        >
          <MoreVertical size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="min-w-[180px] rounded-lg border border-[var(--border)] bg-white shadow-lg"
          style={{ zIndex: 1001 }}
        >
          {menuItems.map(({ icon, label, action }) => (
            <DropdownMenu.Item
              key={action}
              onSelect={() => handleSpaceAction(action)}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
