import { useState, useEffect, useCallback } from 'react'
import { getOpenItemsBySpace, deleteOpenItem } from '../lib/openItems'
import { useAuth } from '../../../hooks/useAuth'

const TYPE_EMOJI = {
  question: '❓',
  exploration: '🔍',
  blocker: '🚫',
  decision_point: '⚖️',
  future_consideration: '💡',
}

export default function SpaceOpenItemsTab({ spaceId, canManage }) {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([]) // [{ meeting, items }]
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getOpenItemsBySpace(spaceId)
      // Group by meeting
      const map = new Map()
      for (const item of data) {
        const key = item.meeting_id ?? '__no_meeting__'
        if (!map.has(key)) {
          map.set(key, { meeting: item.meeting ?? null, items: [] })
        }
        map.get(key).items.push(item)
      }
      // Sort groups by meeting date descending
      const sorted = [...map.values()].sort((a, b) => {
        const da = a.meeting?.date ? new Date(a.meeting.date) : new Date(0)
        const db = b.meeting?.date ? new Date(b.meeting.date) : new Date(0)
        return db - da
      })
      setGroups(sorted)
    } catch (err) {
      console.warn('Failed to fetch open items:', err)
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleDelete(itemId) {
    await deleteOpenItem(itemId)
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) }))
        .filter((g) => g.items.length > 0),
    )
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
  }

  if (groups.length === 0) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        No discussion items yet. Extract from meeting transcripts to capture ideas here.
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.map(({ meeting, items }) => (
          <MeetingGroup
            key={meeting?.id ?? '__no_meeting__'}
            meeting={meeting}
            items={items}
            canManage={canManage}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

function MeetingGroup({ meeting, items, canManage, onDelete }) {
  const [collapsed, setCollapsed] = useState(false)

  const dateStr = meeting?.date
    ? new Date(meeting.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          padding: '0 0 8px',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          borderBottom: '1px solid var(--border)',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', transition: 'transform .15s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {meeting?.title ?? 'Unlinked items'}
        </span>
        {dateStr && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>{dateStr}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} canManage={canManage} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, canManage, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface-secondary)',
        padding: '9px 12px',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: item.transcript_excerpt ? 'pointer' : 'default' }}
        onClick={() => item.transcript_excerpt && setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{TYPE_EMOJI[item.item_type] ?? '📌'}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{item.item_text}</span>
        {canManage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontSize: 14, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
            aria-label="Delete item"
          >
            ×
          </button>
        )}
      </div>

      {expanded && item.transcript_excerpt && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
          "{item.transcript_excerpt}"
        </div>
      )}
    </div>
  )
}
