import { useEffect, useState } from 'react'
import { getUserActionItems } from '../lib/dashboard-queries'

const STATUS_COLORS = {
  completed: { bg: '#EBF7F1', text: '#2D8653', label: '✓ Done' },
  overdue: { bg: '#FEF0ED', text: '#C94830', label: '⚠ Overdue' },
  due_soon: { bg: '#FEF8E7', text: '#C47E0A', label: '! Due Soon' },
  on_track: { bg: '#F2EEE6', text: '#7A6F5E', label: 'On Track' },
}

export default function ActionItemsWidget() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getUserActionItems()
      .then(data => {
        if (active) setItems(data ?? [])
      })
      .catch(() => {
        if (active) setItems([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (items.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No action items</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const colors = STATUS_COLORS[item.status_text] || STATUS_COLORS.on_track
        const dueStr = item.due_date ? new Date(item.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'

        return (
          <div key={item.task_id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'white',
            transition: 'background 0.15s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAF7'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            <div style={{
              width: 3,
              height: 24,
              borderRadius: 2,
              background: colors.text,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#2D2A22',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.title}
              </div>
              {item.assigned_by_name && (
                <div style={{
                  fontSize: 11,
                  color: '#9E9488',
                  marginTop: 2,
                }}>
                  from {item.assigned_by_name}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.text,
                whiteSpace: 'nowrap',
              }}>
                {colors.label}
              </span>
              <span style={{ fontSize: 11, color: '#9E9488', minWidth: 45, textAlign: 'right' }}>
                {dueStr}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
