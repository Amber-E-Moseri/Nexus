import { useState, useEffect, useCallback } from 'react'
import {
  getIdeaBankItems,
  createIdea,
  updateIdea,
  deleteIdea,
} from '../lib/ideaBank'

const TYPE_EMOJI = {
  question: '❓',
  exploration: '🔍',
  blocker: '🚫',
  decision_point: '⚖️',
  future_consideration: '💡',
}

const TYPE_OPTIONS = [
  { value: 'question', label: 'Question' },
  { value: 'exploration', label: 'Exploration' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'decision_point', label: 'Decision Point' },
  { value: 'future_consideration', label: 'Future Consideration' },
]

function buildTree(items) {
  const byParent = new Map()
  for (const item of items) {
    const key = item.parent_item_id ?? '__root__'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(item)
  }
  return byParent
}

export default function IdeaBankPanel({ spaceId, canManage }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creatingParentId, setCreatingParentId] = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getIdeaBankItems({ spaceId })
      setItems(data)
    } catch (err) {
      console.warn('Failed to fetch idea bank items:', err)
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleCreate({ title, itemText, itemType, parentItemId, isPrivate }) {
    const created = await createIdea({ spaceId, title, itemText, itemType, parentItemId, isPrivate })
    setItems((prev) => [...prev, created])
    setShowCreate(false)
    setCreatingParentId(null)
  }

  async function handleUpdate(id, patch) {
    const updated = await updateIdea(id, patch)
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
  }

  async function handleDelete(id) {
    await deleteIdea(id)
    setItems((prev) => prev.filter((i) => i.id !== id && i.parent_item_id !== id))
  }

  const tree = buildTree(items)
  const roots = tree.get('__root__') ?? []

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {canManage && (
        <div style={{ marginBottom: 16 }}>
          {!showCreate ? (
            <button
              type="button"
              onClick={() => { setShowCreate(true); setCreatingParentId(null) }}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Idea
            </button>
          ) : (
            <IdeaForm showPrivateOption onSave={(vals) => handleCreate({ ...vals, parentItemId: null })} onCancel={() => setShowCreate(false)} />
          )}
        </div>
      )}

      {roots.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No ideas yet. Capture questions, blockers, and future considerations here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {roots.map((item) => (
            <IdeaNode
              key={item.id}
              item={item}
              depth={0}
              tree={tree}
              canManage={canManage}
              creatingParentId={creatingParentId}
              onStartCreateChild={setCreatingParentId}
              onCreateChild={handleCreate}
              onCancelCreateChild={() => setCreatingParentId(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function IdeaNode({
  item,
  depth,
  tree,
  canManage,
  creatingParentId,
  onStartCreateChild,
  onCreateChild,
  onCancelCreateChild,
  onUpdate,
  onDelete,
}) {
  const [editing, setEditing] = useState(false)

  const children = tree.get(item.id) ?? []

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface-secondary)',
          padding: '10px 12px',
        }}
      >
        {editing ? (
          <IdeaForm
            initial={{ title: item.title, itemText: item.item_text, itemType: item.item_type }}
            onSave={async (vals) => {
              await onUpdate(item.id, { title: vals.title, item_text: vals.itemText, item_type: vals.itemType })
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{TYPE_EMOJI[item.item_type] ?? '📌'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 2 }}>{item.item_text}</div>
                {item.implementation_plan && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 4 }}>
                    Plan: {item.implementation_plan}
                  </div>
                )}
              </div>
              {item.is_private && (
                <span
                  title="Only visible to you and space admins"
                  style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}
                >
                  🔒
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              {canManage && (
                <button type="button" onClick={() => setEditing(true)} style={linkButtonStyle}>
                  Edit
                </button>
              )}

              {canManage && (
                <button type="button" onClick={() => onStartCreateChild(item.id)} style={linkButtonStyle}>
                  + Sub-idea
                </button>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => onUpdate(item.id, { is_private: !item.is_private })}
                  style={{ ...linkButtonStyle, marginLeft: 'auto' }}
                >
                  {item.is_private ? 'Make public' : 'Make private'}
                </button>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  style={{ ...linkButtonStyle, color: 'var(--text-tertiary)' }}
                  aria-label="Delete idea"
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}

        {creatingParentId === item.id && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <IdeaForm
              showPrivateOption
              onSave={(vals) => onCreateChild({ ...vals, parentItemId: item.id })}
              onCancel={onCancelCreateChild}
            />
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {children.map((child) => (
            <IdeaNode
              key={child.id}
              item={child}
              depth={depth + 1}
              tree={tree}
              canManage={canManage}
              creatingParentId={creatingParentId}
              onStartCreateChild={onStartCreateChild}
              onCreateChild={onCreateChild}
              onCancelCreateChild={onCancelCreateChild}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const linkButtonStyle = {
  border: 'none',
  background: 'none',
  color: 'var(--text-secondary)',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
}

function IdeaForm({ initial, onSave, onCancel, showPrivateOption = false }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [itemText, setItemText] = useState(initial?.itemText ?? '')
  const [itemType, setItemType] = useState(initial?.itemType ?? 'exploration')
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !itemText.trim()) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), itemText: itemText.trim(), itemType, isPrivate })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={inputStyle}
        autoFocus
      />
      <textarea
        placeholder="Describe the idea…"
        value={itemText}
        onChange={(e) => setItemText(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {showPrivateOption && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private
          </label>
        )}
        <button
          type="submit"
          disabled={saving}
          style={{
            border: 'none',
            borderRadius: 6,
            background: 'var(--text-primary)',
            color: 'var(--surface)',
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} style={linkButtonStyle}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const inputStyle = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: '6px 8px',
  fontFamily: 'inherit',
}
