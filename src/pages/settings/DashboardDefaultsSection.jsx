import { CSS } from '@dnd-kit/utilities'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ROLES = ['super_admin', 'dept_lead', 'pastor', 'member']
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_lead: 'Dept Lead',
  pastor: 'Pastor',
  member: 'Member',
}

const WIDGET_DEFS = [
  { key: 'upcoming_events',   label: 'Upcoming Events',           description: 'Next calendar events' },
  { key: 'sprint_progress',   label: 'Sprint Progress',           description: 'Sprint completion bars' },
  { key: 'overdue_by_member', label: 'Overdue Tasks by Member',   description: 'Who has overdue tasks' },
  { key: 'member_activity',   label: 'Member Activity',           description: 'Recent member engagement' },
  { key: 'completion_rate',   label: 'Completion Rate This Week', description: 'Tasks completed vs created' },
  { key: 'my_tasks_summary',  label: 'My Tasks Summary',          description: 'Today, overdue, and this-week counts' },
  { key: 'quick_actions',     label: 'Quick Actions',             description: 'Create task, event, or sprint' },
]

const WIDGET_KEYS = WIDGET_DEFS.map((w) => w.key)

// Canonical seed data per role — used for "Reset to system defaults"
const SYSTEM_DEFAULTS = {
  super_admin: [
    { key: 'quick_actions',     visible: true },
    { key: 'completion_rate',   visible: true },
    { key: 'sprint_progress',   visible: true },
    { key: 'overdue_by_member', visible: true },
    { key: 'upcoming_events',   visible: true },
    { key: 'member_activity',   visible: true },
    { key: 'my_tasks_summary',  visible: true },
  ],
  dept_lead: [
    { key: 'quick_actions',     visible: true },
    { key: 'sprint_progress',   visible: true },
    { key: 'completion_rate',   visible: true },
    { key: 'overdue_by_member', visible: true },
    { key: 'upcoming_events',   visible: true },
    { key: 'my_tasks_summary',  visible: true },
    { key: 'member_activity',   visible: false },
  ],
  pastor: [
    { key: 'my_tasks_summary',  visible: true },
    { key: 'upcoming_events',   visible: true },
    { key: 'member_activity',   visible: true },
    { key: 'sprint_progress',   visible: false },
    { key: 'overdue_by_member', visible: false },
    { key: 'completion_rate',   visible: false },
    { key: 'quick_actions',     visible: false },
  ],
  member: [
    { key: 'my_tasks_summary',  visible: true },
    { key: 'upcoming_events',   visible: true },
    { key: 'sprint_progress',   visible: true },
    { key: 'completion_rate',   visible: false },
    { key: 'overdue_by_member', visible: false },
    { key: 'member_activity',   visible: false },
    { key: 'quick_actions',     visible: false },
  ],
}

function defaultsToRows(defaults) {
  return defaults.map((d, i) => ({
    widget_key: d.key,
    visible: d.visible,
    sort_order: i + 1,
  }))
}

function mergeWithAllKeys(rows) {
  const map = new Map(rows.map((r) => [r.widget_key, r]))
  const maxOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order ?? 0)) : 0
  return WIDGET_KEYS.map((key, i) =>
    map.has(key) ? map.get(key) : { widget_key: key, visible: false, sort_order: maxOrder + i + 1 },
  )
}

function SortableDefaultRow({ item, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.widget_key,
  })
  const def = WIDGET_DEFS.find((w) => w.key === item.widget_key)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        background: '#FAFAF7',
        border: '1px solid #EDE8DC',
        borderRadius: 12,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${def?.label}`}
        style={{
          border: 'none',
          background: 'none',
          cursor: 'grab',
          color: '#C8BFB2',
          fontSize: 15,
          padding: '0 2px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ⋮⋮
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1610' }}>{def?.label ?? item.widget_key}</div>
        {def?.description ? (
          <div style={{ fontSize: 11.5, color: '#9E9488', marginTop: 2 }}>{def.description}</div>
        ) : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={item.visible}
        onClick={() => onToggle(item.widget_key)}
        style={{
          width: 38,
          height: 21,
          borderRadius: 11,
          border: 'none',
          background: item.visible ? '#4C2A92' : '#D1CBC0',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          padding: 0,
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: 3,
            left: item.visible ? 20 : 3,
            transition: 'left .15s',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      </button>
    </div>
  )
}

export default function DashboardDefaultsSection() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [activeRole, setActiveRole] = useState('super_admin')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadDefaults(role) {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase
        .from('dashboard_role_defaults')
        .select('widget_key, visible, sort_order')
        .eq('role', role)
        .order('sort_order')

      if (error) throw error
      setRows(mergeWithAllKeys(data ?? []))
    } catch (err) {
      setMessage(err.message)
      setRows(mergeWithAllKeys([]))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDefaults(activeRole)
  }, [activeRole])

  function handleToggle(key) {
    setRows((current) =>
      current.map((r) => (r.widget_key === key ? { ...r, visible: !r.visible } : r)),
    )
    setMessage('')
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex((r) => r.widget_key === active.id)
    const newIndex = rows.findIndex((r) => r.widget_key === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setRows((current) => arrayMove(current, oldIndex, newIndex))
    setMessage('')
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const resequenced = rows.map((r, i) => ({
        role: activeRole,
        widget_key: r.widget_key,
        visible: r.visible,
        sort_order: i + 1,
      }))

      const { error: delError } = await supabase
        .from('dashboard_role_defaults')
        .delete()
        .eq('role', activeRole)

      if (delError) throw delError

      const { error: insError } = await supabase.from('dashboard_role_defaults').insert(resequenced)
      if (insError) throw insError

      setMessage('Saved.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetRole() {
    const confirmed = window.confirm(
      `Reset ${ROLE_LABELS[activeRole]} to system defaults? This overwrites the current layout for this role.`,
    )
    if (!confirmed) return

    setSaving(true)
    setMessage('')
    try {
      const defaults = SYSTEM_DEFAULTS[activeRole] ?? []
      const resequenced = defaultsToRows(defaults).map((r) => ({ ...r, role: activeRole }))

      const { error: delError } = await supabase
        .from('dashboard_role_defaults')
        .delete()
        .eq('role', activeRole)

      if (delError) throw delError

      const { error: insError } = await supabase.from('dashboard_role_defaults').insert(resequenced)
      if (insError) throw insError

      await loadDefaults(activeRole)
      setMessage('Reset to system defaults.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Dashboard Defaults
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 0 }}>
          Set the default widget layout for each role. Users see this until they customize their own dashboard.
        </p>
      </div>

      {/* Role tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: activeRole === role ? '#4C2A92' : '#E9E4D8',
              background: activeRole === role ? '#EDE8F8' : 'white',
              color: activeRole === role ? '#4C2A92' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .12s',
            }}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {/* Widget list */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '16px 20px',
        }}
      >
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>Loading…</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rows.map((r) => r.widget_key)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map((row) => (
                  <SortableDefaultRow key={row.widget_key} item={row} onToggle={handleToggle} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            background: '#4C2A92',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving || loading ? 'not-allowed' : 'pointer',
            opacity: saving || loading ? 0.65 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save layout'}
        </button>
        <button
          type="button"
          onClick={handleResetRole}
          disabled={saving || loading}
          style={{
            background: 'white',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: saving || loading ? 'not-allowed' : 'pointer',
            opacity: saving || loading ? 0.65 : 1,
          }}
        >
          Reset role to system defaults
        </button>
        {message ? (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{message}</span>
        ) : null}
      </div>
    </section>
  )
}
