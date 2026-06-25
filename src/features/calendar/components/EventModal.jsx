import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createEventDirectly, deleteCalendarEvent, updateCalendarEvent, getEventTypes } from '..'
import { listDepartments } from '../../../lib/people/api'
import { getMySprints } from '../../sprints'
import { EVENT_COLORS } from './CalendarEventCard'

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

function toDateInput(date) {
  if (!date) return ''
  const value = new Date(date)
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, '0')
  const dd = String(value.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toTimeInput(date) {
  if (!date) return '09:00'
  const value = new Date(date)
  const hh = String(value.getHours()).padStart(2, '0')
  const mm = String(value.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function EventModal({
  event = null,
  defaultDate = null,
  initialSpaceId = null,
  initialSprintId = null,
  canEditOverride = null,
  onSaved,
  onClose,
}) {
  const { profile, role } = useAuth()
  const [departments, setDepartments] = useState([])
  const [sprints, setSprints] = useState([])
  const [eventTypes, setEventTypes] = useState([])
  const [title, setTitle] = useState(event?.title ?? '')
  const [eventType, setEventType] = useState(event?.event_type ?? 'event')
  const [date, setDate] = useState(toDateInput(event?.start_date ?? defaultDate))
  const [time, setTime] = useState(toTimeInput(event?.start_date ?? defaultDate))
  const [endDate, setEndDate] = useState(toDateInput(event?.end_date))
  const [allDay, setAllDay] = useState(event?.all_day ?? true)
  const [location, setLocation] = useState(event?.location ?? '')
  const [zoomJoinUrl, setZoomJoinUrl] = useState(event?.zoom_join_url ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [spaceId, setSpaceId] = useState(event?.space_id ?? initialSpaceId ?? '')
  const [sprintId, setSprintId] = useState(event?.sprint_id ?? initialSprintId ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef(null)

  const canEdit = canEditOverride ?? ['super_admin', 'dept_lead'].includes(role)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    listDepartments().then(setDepartments).catch(() => setDepartments([]))
    getMySprints().then(setSprints).catch(() => setSprints([]))
    getEventTypes().then(setEventTypes).catch(() => setEventTypes([]))
  }, [])

  const startDateValue = useMemo(() => {
    if (!date) return null
    return allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time || '09:00'}:00`)
  }, [allDay, date, time])

  async function handleSave() {
    if (!title.trim() || !startDateValue) {
      setError('Title and start date are required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        start_date: startDateValue.toISOString(),
        end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
        all_day: allDay,
        location: location.trim() || null,
        zoom_join_url: zoomJoinUrl.trim() || null,
        space_id: spaceId || null,
        sprint_id: sprintId || null,
      }

      const saved = event
        ? await updateCalendarEvent(event.id, payload)
        : await createEventDirectly(payload, profile.id, role)

      onSaved?.(saved)
      onClose()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteCalendarEvent(event.id)
      onSaved?.()
      onClose()
    } catch (nextError) {
      setError(nextError.message)
      setSaving(false)
    }
  }

  if (!canEdit) return null

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,30,0.45)', backdropFilter: 'blur(2px)', zIndex: 40 }} />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(700px, 95vw)',
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {event ? 'Edit event' : 'New event'}
            </Dialog.Title>
            <Dialog.Close style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }} aria-label="Close">
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {error ? <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--coral-light)', color: 'var(--coral-dark)', fontSize: 13 }}>{error}</div> : null}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Title *</label>
              <input ref={titleRef} type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, fontSize: 15, padding: '10px 12px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Event type</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: EVENT_COLORS[eventType] }} />
                  Event colour preview
                </div>
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Zoom link</label>
              <input
                type="url"
                value={zoomJoinUrl}
                onChange={(e) => setZoomJoinUrl(e.target.value)}
                style={inputStyle}
                placeholder="https://zoom.us/j/..."
              />
            </div>

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="all-day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
              <label htmlFor="all-day" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                All day event
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: allDay ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
              {!allDay ? (
                <div>
                  <label style={labelStyle}>Start time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
                </div>
              ) : null}
              <div>
                <label style={labelStyle}>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Link to Space</label>
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} style={inputStyle}>
                  <option value="">None</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Link to Sprint</label>
                <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} style={inputStyle}>
                  <option value="">None</option>
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <div>
              {event ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    fontSize: 13,
                    padding: '7px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: confirmDelete ? '#FDECEC' : 'transparent',
                    color: confirmDelete ? '#A32D2D' : 'var(--text-tertiary)',
                    border: confirmDelete ? '1px solid #F5AEAE' : '1px solid var(--border)',
                    fontWeight: confirmDelete ? 500 : 400,
                  }}
                >
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Dialog.Close style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Cancel
              </Dialog.Close>
              <button type="button" onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: 500, padding: '7px 20px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : event ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
