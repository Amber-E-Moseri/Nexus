import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  createSpace,
  SPACE_TYPE_LABELS,
  updateSpace,
  VISIBILITY_LABELS,
} from '../../lib/spaces'

const COLOR_SWATCHES = ['185FA5', '3B6D11', '854F0B', 'A32D2D', '534AB7', 'E91E8C', '2F855A', 'D97706']

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

function visibilityForType(type, currentVisibility, currentUserId) {
  if (type === 'personal') {
    return { visibility: 'private', owner_id: currentUserId }
  }
  if (type === 'department') {
    return { visibility: 'department', owner_id: currentUserId }
  }
  return { visibility: currentVisibility || 'org', owner_id: currentUserId }
}

export default function SpaceModal({ mode = 'create', space = null, onSaved, onClose }) {
  const { profile, role } = useAuth()
  const [name, setName] = useState(space?.name ?? '')
  const [description, setDescription] = useState(space?.description ?? '')
  const [spaceType, setSpaceType] = useState(space?.space_type ?? 'program')
  const [visibility, setVisibility] = useState(space?.visibility ?? 'org')
  const [color, setColor] = useState(space?.color ?? '534AB7')
  const [startDate, setStartDate] = useState(space?.start_date ?? '')
  const [endDate, setEndDate] = useState(space?.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const next = visibilityForType(spaceType, visibility, profile?.id)
    setVisibility(next.visibility)
  }, [spaceType, profile?.id])

  const visibleTypes = useMemo(() => {
    const base = ['program', 'personal', 'sandbox']
    return role === 'super_admin' ? ['department', ...base] : base
  }, [role])

  async function handleSave() {
    if (!name.trim()) {
      setError('Space name is required.')
      titleRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      space_type: spaceType,
      visibility,
      color,
      owner_id: spaceType === 'personal' ? profile?.id : space?.owner_id ?? profile?.id,
      start_date: startDate || null,
      end_date: endDate || null,
    }

    try {
      const saved = mode === 'create'
        ? await createSpace(payload, profile.id)
        : await updateSpace(space.id, payload)

      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,14,30,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(680px, 95vw)',
            maxHeight: '90vh',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden',
          }}
          aria-describedby={undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {mode === 'create' ? 'New space' : 'Edit space'}
            </Dialog.Title>
            <Dialog.Close style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }} aria-label="Close">
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {error ? (
              <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: '#FDECEC', color: '#A32D2D', fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Name *</label>
              <input ref={titleRef} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Healing Streams" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What is this space for?" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={spaceType} onChange={(e) => setSpaceType(e.target.value)} style={inputStyle}>
                  {visibleTypes.map((type) => (
                    <option key={type} value={type}>{SPACE_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  style={inputStyle}
                  disabled={spaceType === 'personal' || spaceType === 'department'}
                >
                  {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Colour</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      background: `#${swatch}`,
                      border: color === swatch ? '3px solid var(--text-primary)' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                    aria-label={`Select colour ${swatch}`}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <Dialog.Close style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Cancel
            </Dialog.Close>
            <button type="button" onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: 500, padding: '7px 20px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create space' : 'Save changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
