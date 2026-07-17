import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { getEventTypes as fetchEventTypes, createEventType, updateEventType, deleteEventType, getEventTypeUsageCount, cascadeRenameEventType } from '../../features/calendar'

const PRESET_COLORS = [
  '#7C3AED', '#6366F1', '#2563EB', '#06B6D4', '#059669',
  '#10B981', '#D97706', '#F59E0B', '#EC4899', '#DB2777',
  '#DC2626', '#EF4444', '#4C2A92', '#374151', '#6B7280',
]

export default function CalendarManagementPage() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const [eventTypes, setEventTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({ name: '', color: '#6366F1', active: true, reminder_configs: [] })
  const [saving, setSaving] = useState(false)

  async function loadEventTypes() {
    setLoading(true)
    try {
      const types = await fetchEventTypes({ includeInactive: true })
      setEventTypes(types)
    } catch (err) {
      console.error('Failed to load event types:', err)
      showToast('Failed to load event types', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEventTypes()
  }, [])

  async function handleSave() {
    if (!formData.name.trim()) {
      showToast('Event type name is required', { tone: 'error' })
      return
    }

    const leadTimes = formData.reminder_configs.map((entry) => Number(entry.days_before))
    if (new Set(leadTimes).size !== leadTimes.length) {
      showToast('Duplicate lead time - each reminder must be a unique number of days.', { tone: 'error' })
      return
    }

    setSaving(true)
    try {
      if (editing && editing !== 'new' && editing.active && formData.active === false) {
        const refCount = await getEventTypeUsageCount(editing.name)
        if (refCount > 0) {
          const confirmed = window.confirm(`${refCount} events still use this type. Deactivating will hide it from new event dropdowns but will not affect existing events. Continue?`)
          if (!confirmed) {
            setSaving(false)
            return
          }
        }
      }

      if (editing && editing !== 'new') {
        await updateEventType(editing.id, {
          name: formData.name,
          color: formData.color,
          active: formData.active,
          reminder_configs: formData.reminder_configs,
        })
        if (editing.name !== formData.name) {
          await cascadeRenameEventType(editing.name, formData.name)
        }
        showToast('Event type updated', { tone: 'success' })
      } else {
        await createEventType({
          name: formData.name,
          color: formData.color,
          active: formData.active,
          reminder_configs: formData.reminder_configs,
        })
        showToast('Event type created', { tone: 'success' })
      }
      setEditing(null)
      setFormData({ name: '', color: '#6366F1', active: true, reminder_configs: [] })
      await loadEventTypes()
    } catch (err) {
      console.error('Failed to save event type:', err)
      showToast('Failed to save event type', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    const type = eventTypes.find((entry) => entry.id === id)
    if (!type) return

    let refCount = 0
    try {
      refCount = await getEventTypeUsageCount(type.name)
    } catch (err) {
      console.error('Failed to check event type usage:', err)
      showToast('Failed to check event type usage', { tone: 'error' })
      return
    }

    if (refCount > 0) {
      showToast(`Cannot delete - ${refCount} events still reference this type. Deactivate it instead.`, { tone: 'error' })
      return
    }

    if (!window.confirm('Delete this event type?')) return

    try {
      await deleteEventType(id)
      showToast('Event type deleted', { tone: 'success' })
      await loadEventTypes()
    } catch (err) {
      console.error('Failed to delete event type:', err)
      showToast('Failed to delete event type', { tone: 'error' })
    }
  }

  function handleEdit(type) {
    setEditing(type)
    setFormData({
      name: type.name,
      color: type.color || '#6366F1',
      active: type.active ?? true,
      reminder_configs: Array.isArray(type.reminder_configs) ? type.reminder_configs : [],
    })
  }

  function handleCancel() {
    setEditing(null)
    setFormData({ name: '', color: '#6366F1', active: true, reminder_configs: [] })
  }

  function updateReminder(index, key, value) {
    setFormData((current) => ({
      ...current,
      reminder_configs: current.reminder_configs.map((entry, position) => (
        position === index ? { ...entry, [key]: value } : entry
      )),
    }))
  }

  if (role !== 'super_admin' && role !== 'dept_lead') {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>You don't have permission to access this page.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          BLW CAN NEXUS / Ministry Calendar / Calendar Management
        </div>
        <h1 style={{ marginTop: '8px', fontSize: '28px', fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
          Calendar Management
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Configure event types and calendar settings for your organization.
        </p>
      </div>

      {/* Event Types Section */}
      <div style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        backgroundColor: 'white',
        padding: '24px',
        boxShadow: 'var(--card-shadow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Event Types
          </h2>
          {!editing && (
            <button
              onClick={() => setEditing('new')}
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} />
              Add Event Type
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {editing && (
          <div style={{
            padding: '16px',
            backgroundColor: 'var(--surface-tertiary)',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-primary)'
              }}>
                Event Type Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Conference"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Color
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c })}
                    title={c}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c,
                      border: formData.color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                      outline: formData.color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: 1,
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'transform 0.1s',
                      transform: formData.color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginLeft: 4,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: formData.color,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  {formData.color}
                </div>
              </div>
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: 'var(--text-primary)'
            }}>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              Active
            </label>

            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Reminder Configs
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {formData.reminder_configs.map((entry, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      value={entry.days_before}
                      onChange={(e) => updateReminder(index, 'days_before', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={entry.sprint_prompt === true}
                        onChange={(e) => updateReminder(index, 'sprint_prompt', e.target.checked)}
                      />
                      Sprint prompt
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData((current) => ({
                        ...current,
                        reminder_configs: current.reminder_configs.filter((_, position) => position !== index),
                      }))}
                      style={{
                        padding: '8px 10px',
                        background: 'transparent',
                        color: '#DC2626',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData((current) => ({
                    ...current,
                    reminder_configs: [...current.reminder_configs, { days_before: 30, sprint_prompt: false }],
                  }))}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    color: 'var(--accent)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                >
                  Add Reminder
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Event Types List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
            Loading event types...
          </div>
        ) : eventTypes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
            No event types configured. Create one to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {eventTypes.map((type) => (
              <div
                key={type.id || type}
                style={{
                  padding: '16px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: type.color || '#6366F1'
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {typeof type === 'string' ? type : type.name}
                    </div>
                    {typeof type !== 'string' ? (
                      <div style={{ fontSize: '11px', color: type.active ? '#2D8653' : 'var(--text-tertiary)' }}>
                        {type.active ? 'Active' : 'Inactive'} · {Array.isArray(type.reminder_configs) ? type.reminder_configs.length : 0} reminder(s)
                      </div>
                    ) : null}
                  </div>
                </div>
                {typeof type !== 'string' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleEdit(type)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(type.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#EF4444',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
