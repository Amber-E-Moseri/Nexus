// ClickUp-style "Create Folder" modal: name, optional description, private
// toggle. Folder description lands in folders.description (migration 20260710).
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createFolder } from '../lib/spaces'

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

export default function CreateFolderModal({ space, onCreated, onClose }) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function handleCreate() {
    if (!name.trim()) {
      setError('Folder name is required.')
      nameRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const folder = await createFolder(space.id, name, profile?.id, {
        description: description.trim() || null,
        visibility: isPrivate ? 'private' : 'public',
      })
      onCreated?.(folder)
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
            width: 'min(480px, 95vw)',
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
          <div style={{ padding: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Dialog.Title style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Create Folder
              </Dialog.Title>
              <Dialog.Close style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }} aria-label="Close">
                ×
              </Dialog.Close>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Use Folders to organize your Lists in {space.name}.
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px' }}>
            {error ? (
              <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--coral-light)', color: 'var(--coral-dark)', fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Name *</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
                placeholder="e.g. Project, Client, Team"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Tell us a bit about your Folder (optional)"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Make private</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>Only you and invited members have access</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate((value) => !value)}
                style={{
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  border: 'none',
                  background: isPrivate ? 'var(--accent)' : '#C9C0B0',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: isPrivate ? 19 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: 'white',
                    transition: 'left 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <Dialog.Close style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: '7px 20px',
                borderRadius: 8,
                cursor: saving || !name.trim() ? 'default' : 'pointer',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                opacity: saving || !name.trim() ? 0.55 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
