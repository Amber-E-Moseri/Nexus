// ClickUp-style "Create List" modal: name + quick-name chips, searchable
// location picker (space root or a folder inside the space), private toggle.
// Lists at space root are "unfolded" (lists.folder_id null, migration 20260803).
import * as Dialog from '@radix-ui/react-dialog'
import { Check, ChevronDown, ChevronUp, Folder, Search, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createList, getFolders } from '../lib/spaces'

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

const NAME_PRESETS = [
  { label: 'Backlog', icon: <Folder size={12} /> },
  { label: 'Notes', icon: <span style={{ fontSize: 12 }}>📋</span> },
  { label: 'Quick Wins', icon: <Star size={12} /> },
]

function SpaceGlyph({ color, name }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        background: `#${color ?? '4C2A92'}`,
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {name?.charAt(0)?.toUpperCase() ?? '?'}
    </span>
  )
}

function LocationOption({ selected, indent = 0, icon, label, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        paddingLeft: 10 + indent,
        border: 'none',
        borderRadius: 8,
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 12.5,
        color: 'var(--text-primary)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-tint, #EDE8F8)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {selected ? <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : null}
    </button>
  )
}

export default function CreateListModal({ space, defaultFolderId = null, onCreated, onClose }) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [folders, setFolders] = useState([])
  const [folderId, setFolderId] = useState(defaultFolderId)
  const [isPrivate, setIsPrivate] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    getFolders(space.id)
      .then(setFolders)
      .catch((err) => setError(err.message))
  }, [space.id])

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === folderId) ?? null,
    [folders, folderId],
  )

  const filteredFolders = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return folders
    return folders.filter((folder) => folder.name.toLowerCase().includes(term))
  }, [folders, search])

  const spaceMatchesSearch = !search.trim() || space.name.toLowerCase().includes(search.trim().toLowerCase())

  async function handleCreate() {
    if (!name.trim()) {
      setError('List name is required.')
      nameRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const list = await createList(space.id, name, folderId, profile?.id, {
        visibility: isPrivate ? 'private' : 'public',
      })
      onCreated?.(list)
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
            width: 'min(520px, 95vw)',
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
            <Dialog.Title style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Create List
            </Dialog.Title>
            <Dialog.Close style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }} aria-label="Close">
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {NAME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => { setName(preset.label); nameRef.current?.focus() }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: name === preset.label ? 'var(--purple-tint, #EDE8F8)' : 'white',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {preset.icon}
                  {preset.label}
                </button>
              ))}
            </div>

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
                placeholder="Your list or project name"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Space (location)</label>
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {selectedFolder
                  ? <Folder size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />
                  : <SpaceGlyph color={space.color} name={space.name} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFolder ? selectedFolder.name : space.name}
                </span>
                {pickerOpen ? <ChevronUp size={15} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-tertiary)' }} />}
              </button>

              {pickerOpen ? (
                <div
                  style={{
                    marginTop: 6,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(28,22,16,0.12)',
                    padding: 8,
                    background: 'white',
                  }}
                >
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={13} style={{ position: 'absolute', top: '50%', left: 9, transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                      autoFocus
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      style={{ ...inputStyle, paddingLeft: 28, fontSize: 12.5 }}
                    />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', padding: '2px 10px 4px' }}>
                    Spaces
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {spaceMatchesSearch ? (
                      <LocationOption
                        selected={!folderId}
                        icon={<SpaceGlyph color={space.color} name={space.name} />}
                        label={space.name}
                        onSelect={() => { setFolderId(null); setPickerOpen(false); setSearch('') }}
                      />
                    ) : null}
                    {filteredFolders.map((folder) => (
                      <LocationOption
                        key={folder.id}
                        selected={folderId === folder.id}
                        indent={18}
                        icon={<Folder size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />}
                        label={folder.name}
                        onSelect={() => { setFolderId(folder.id); setPickerOpen(false); setSearch('') }}
                      />
                    ))}
                    {!spaceMatchesSearch && filteredFolders.length === 0 ? (
                      <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}>No matches</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
