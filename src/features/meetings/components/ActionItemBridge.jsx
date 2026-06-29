import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { createTasksFromActionItems } from '../lib/meetings'

const emptyItem = { title: '', assigneeId: '', dueDate: '', description: '' }

function useMeetingAttendees(meetingId, departmentId) {
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (!meetingId && !departmentId) return
    let active = true

    async function load() {
      // Prefer meeting attendees so cross-dept people can be assigned
      if (meetingId) {
        const { data } = await supabase
          .from('meeting_attendance')
          .select('user:users!user_id(id, name, avatar_url, department_id)')
          .eq('meeting_id', meetingId)
        if (active && data?.length) {
          setMembers(data.map((r) => r.user).filter(Boolean))
          return
        }
      }
      // Fall back to dept members when no attendance records exist yet
      if (departmentId) {
        const { data } = await supabase
          .from('users')
          .select('id, name, avatar_url, department_id')
          .eq('department_id', departmentId)
          .order('name')
        if (active) setMembers(data ?? [])
      }
    }

    load()
    return () => { active = false }
  }, [meetingId, departmentId])

  return members
}

export default function ActionItemBridge({ meetingId, departmentId, onSaved, onCancel }) {
  const { profile } = useAuth()
  const [items, setItems] = useState([emptyItem])
  const members = useMeetingAttendees(meetingId, departmentId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function addRow() {
    setItems((previous) => [...previous, emptyItem])
  }

  function updateRow(index, field, value) {
    setItems((previous) =>
      previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    )
  }

  function removeRow(index) {
    setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleSave() {
    const validItems = items
      .map((item) => ({
        title: item.title.trim(),
        assigneeId: item.assigneeId || null,
        dueDate: item.dueDate || null,
        description: item.description.trim() || null,
      }))
      .filter((item) => item.title)

    if (!validItems.length) {
      setError('Add at least one action item title.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const tasks = await createTasksFromActionItems(meetingId, departmentId, validItems, profile?.id)
      onSaved?.(tasks)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--surface-secondary)',
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Create department tasks</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        These tasks are created in the main department task board with source set to Meeting.
      </div>

      {error ? (
        <div
          style={{
            marginTop: 10,
            borderRadius: 10,
            background: '#fff2f2',
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--coral-dark)',
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, index) => (
          <div key={index} style={{ borderRadius: 12, background: 'white', padding: 12 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 132px auto' }}>
              <input
                value={item.title}
                onChange={(event) => updateRow(index, 'title', event.target.value)}
                placeholder="Action item title"
                style={{
                  minWidth: 0,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  padding: '8px 10px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              />
              <select
                value={item.assigneeId}
                onChange={(event) => updateRow(index, 'assigneeId', event.target.value)}
                style={{
                  minWidth: 0,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  padding: '8px 10px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={item.dueDate}
                onChange={(event) => updateRow(index, 'dueDate', event.target.value)}
                style={{
                  minWidth: 0,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  padding: '8px 10px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              />
              {items.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              ) : (
                <div />
              )}
            </div>
            <textarea
              value={item.description}
              onChange={(event) => updateRow(index, 'description', event.target.value)}
              placeholder="Optional details or follow-up notes"
              rows={2}
              style={{
                marginTop: 8,
                width: '100%',
                resize: 'vertical',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'white',
                padding: '8px 10px',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          + Add row
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'white',
              padding: '7px 12px',
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'white',
              cursor: 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Create tasks'}
          </button>
        </div>
      </div>
    </div>
  )
}
