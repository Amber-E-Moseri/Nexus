import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { updateEventType, deleteEventType } from '../lib/calendar'

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

export default function EventTypeEditModal({ eventType = null, onClose, onSaved }) {
  const [name, setName] = useState(eventType?.name ?? '')
  const [color, setColor] = useState(eventType?.color ?? '#5B34C7')
  const [sortOrder, setSortOrder] = useState(eventType?.sort_order ?? 0)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const isEdit = !!eventType
  const isOpen = !!eventType

  async function handleSave() {
    if (!name.trim()) {
      setError('Category name is required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await updateEventType(eventType.id, {
        name: name.trim(),
        color,
        sort_order: parseInt(sortOrder, 10) || 0,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save category.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await deleteEventType(eventType.id)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to delete category.')
      setDeleting(false)
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.3)', zIndex: 40 }} />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            borderRadius: 12,
            boxShadow: 'var(--card-shadow)',
            padding: 0,
            maxWidth: 420,
            width: '90%',
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <Dialog.Title style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Edit Category
            </Dialog.Title>
            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ padding: 10, background: '#FEE2E2', color: '#DC2626', fontSize: 12, borderRadius: 6, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Name field */}
            <div>
              <label style={labelStyle}>Category Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Birthday"
                style={inputStyle}
                disabled={saving || deleting}
              />
            </div>

            {/* Color picker */}
            <div>
              <label style={labelStyle}>Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: '100%',
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
                disabled={saving || deleting}
              />
            </div>

            {/* Sort order */}
            <div>
              <label style={labelStyle}>Display Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                min="0"
                max="999"
                style={inputStyle}
                disabled={saving || deleting}
              />
            </div>

            {/* Delete confirmation */}
            {confirmDelete && (
              <div style={{ padding: 12, background: '#FEF0ED', border: '1px solid #FECACA', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>
                  Delete "{name}"?
                </div>
                <div style={{ fontSize: 11, color: '#991B1B', marginBottom: 8 }}>
                  This action cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: '#DC2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: deleting ? 'not-allowed' : 'pointer',
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      background: 'var(--surface-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: 16,
              borderTop: '1px solid var(--border)',
            }}
          >
            {!confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: saving || deleting ? 0.6 : 1,
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={onClose}
              disabled={saving || deleting}
              style={{
                padding: '8px 16px',
                background: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting || !name.trim()}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving || !name.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
