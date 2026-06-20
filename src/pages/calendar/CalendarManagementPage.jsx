import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { getEventTypes as fetchEventTypes, createEventType, updateEventType, deleteEventType } from '../../lib/calendar'

const EVENT_TYPE_COLORS = {
  conference: '#6366F1',
  program: '#8B5CF6',
  training: '#EC4899',
  prayer: '#06B6D4',
  graduation: '#10B981',
  event: '#F59E0B',
  deadline: '#EF4444',
}

export default function CalendarManagementPage() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const [eventTypes, setEventTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({ name: '', color: '#6366F1' })
  const [saving, setSaving] = useState(false)

  async function loadEventTypes() {
    setLoading(true)
    try {
      const types = await fetchEventTypes()
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

    setSaving(true)
    try {
      if (editing) {
        await updateEventType(editing.id, {
          name: formData.name,
          color: formData.color,
        })
        showToast('Event type updated', { tone: 'success' })
      } else {
        await createEventType({
          name: formData.name,
          color: formData.color,
        })
        showToast('Event type created', { tone: 'success' })
      }
      setEditing(null)
      setFormData({ name: '', color: '#6366F1' })
      await loadEventTypes()
    } catch (err) {
      console.error('Failed to save event type:', err)
      showToast('Failed to save event type', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
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
    setFormData({ name: type.name, color: type.color || '#6366F1' })
  }

  function handleCancel() {
    setEditing(null)
    setFormData({ name: '', color: '#6366F1' })
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
                marginBottom: '6px',
                color: 'var(--text-primary)'
              }}>
                Color
              </label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                style={{
                  width: '100%',
                  height: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              />
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
                      backgroundColor: type.color || EVENT_TYPE_COLORS[type] || '#6366F1'
                    }}
                  />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {typeof type === 'string' ? type : type.name}
                  </span>
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

