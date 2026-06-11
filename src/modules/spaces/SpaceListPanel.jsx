import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { archiveList, createList, updateList } from '../../lib/spaces'

export default function SpaceListPanel({ spaceId, lists, onListCreated, onListUpdated, onListSelected, selectedListId }) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(event) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const created = await createList(spaceId, name.trim(), profile?.id)
      setName('')
      onListCreated?.(created)
    } finally {
      setSaving(false)
    }
  }

  async function handleRename(listId) {
    if (!editingName.trim()) return
    setSaving(true)
    try {
      const updated = await updateList(listId, { name: editingName.trim() })
      setEditingId(null)
      setEditingName('')
      onListUpdated?.(updated)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(listId) {
    setSaving(true)
    try {
      const updated = await archiveList(listId)
      onListUpdated?.(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Lists</div>
        <div className="space-y-3">
          {lists.map((list) => (
            <div key={list.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3">
              {editingId === list.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-[180px] flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                  <button type="button" onClick={() => handleRename(list.id)} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onListSelected?.(list.id)}
                    className={[
                      'min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm',
                      selectedListId === list.id ? 'bg-white text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-[var(--text-secondary)]',
                    ].join(' ')}
                  >
                    {list.name}
                  </button>
                  <span className="text-xs text-[var(--text-tertiary)]">#{list.sort_order}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(list.id)
                      setEditingName(list.name)
                    }}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Rename
                  </button>
                  {list.name !== 'General' ? (
                    <button
                      type="button"
                      onClick={() => handleArchive(list.id)}
                      className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
                    >
                      Archive
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ))}

          {lists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              No lists yet — create one to organise tasks.
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleCreate} className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">New list</div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name"
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
          />
          <button type="submit" disabled={!name.trim() || saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Adding…' : '+ New list'}
          </button>
        </div>
      </form>
    </div>
  )
}
