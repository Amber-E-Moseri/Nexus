import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../notifications/lib/notifications'
import { createRecurringMeetings } from '../lib/meetings'
import { DAYS_OF_WEEK, MAX_OCCURRENCES, buildRecurrenceRule, generateOccurrenceDates } from '../lib/recurrence'

const MEETING_TYPES = ['general', 'team', 'department', 'media']

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
}

export default function ScheduleMeetingModal({ onClose, onSaved }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [meetingType, setMeetingType] = useState('general')
  const [agenda, setAgenda] = useState('')
  const [attendeeIds, setAttendeeIds] = useState([])
  const [orgMembers, setOrgMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [recurring, setRecurring] = useState(false)
  const [recurrenceData, setRecurrenceData] = useState({
    frequency: 'none',
    daysOfWeek: new Set(),
    dayOfMonth: 1,
    endType: 'occurrences',
    occurrences: 10,
    endDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    supabase.from('users').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setOrgMembers(data ?? []))
      .catch(() => {})
  }, [])

  function toggleAttendee(userId) {
    setAttendeeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!date) { setError('Date is required.'); return }

    setSaving(true)
    setError(null)

    try {
      const meetingDate = time ? `${date}T${time}:00` : date
      const payload = {
        title: title.trim(),
        date: meetingDate,
        meeting_type: meetingType,
        status: 'scheduled',
        visibility: 'published',
        created_by: profile?.id,
        department_id: profile?.department_id ?? null,
      }
      if (agenda.trim()) payload.agenda = agenda.trim()

      let createdMeetings = []

      if (recurring && recurrenceData.frequency !== 'none') {
        // Generate all occurrence dates and create recurring meetings
        const startDateTime = new Date(meetingDate)
        const occurrenceDates = generateOccurrenceDates(startDateTime, recurrenceData)
        const recurrenceRule = buildRecurrenceRule(recurring, recurrenceData)

        createdMeetings = await createRecurringMeetings({
          baseMeeting: payload,
          attendeeIds,
          occurrenceDates,
          recurrenceRule,
        })

        // Notify once per attendee (referencing first occurrence only)
        if (createdMeetings.length > 0 && attendeeIds.length > 0) {
          const firstMeeting = createdMeetings[0]
          for (const uid of attendeeIds) {
            if (uid !== profile?.id) {
              createNotification(uid, 'meeting_scheduled', {
                meetingId: firstMeeting.id,
                title: `${firstMeeting.title} (recurring)`,
                date: firstMeeting.date,
              }).catch(() => {})
            }
          }
        }

        onSaved?.(createdMeetings[0])
      } else {
        // Single non-recurring meeting
        const { data: meeting, error: insertError } = await supabase
          .from('meetings')
          .insert(payload)
          .select('id, title, date')
          .single()

        if (insertError) throw insertError

        // Add attendance rows for selected attendees
        if (attendeeIds.length > 0) {
          await supabase.from('meeting_attendance').insert(
            attendeeIds.map((uid) => ({ meeting_id: meeting.id, user_id: uid, status: 'pending' })),
          )

          // Notify each attendee (skip self)
          for (const uid of attendeeIds) {
            if (uid !== profile?.id) {
              createNotification(uid, 'meeting_scheduled', {
                meetingId: meeting.id,
                title: meeting.title,
                date: meeting.date,
              }).catch(() => {})
            }
          }
        }

        onSaved?.(meeting)
      }
    } catch (err) {
      setError(err.message ?? 'Failed to schedule meeting.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'white', borderRadius: 20, padding: 28,
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
          Schedule Meeting
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#C94830', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            <span style={labelStyle}>Title *</span>
            <input
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              autoFocus
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              <span style={labelStyle}>Date *</span>
              <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              <span style={labelStyle}>Time</span>
              <input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              <span style={labelStyle}>Duration (min)</span>
              <input
                type="number"
                min={15}
                step={15}
                style={inputStyle}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </label>
            <label>
              <span style={labelStyle}>Type</span>
              <select style={inputStyle} value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Repeat this meeting</span>
          </label>

          {recurring && (
            <div style={{ padding: 12, background: 'var(--surface-tertiary)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>
                <span style={labelStyle}>Frequency</span>
                <select
                  style={inputStyle}
                  value={recurrenceData.frequency}
                  onChange={(e) => setRecurrenceData((prev) => ({ ...prev, frequency: e.target.value }))}
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              {(recurrenceData.frequency === 'weekly' || recurrenceData.frequency === 'bi-weekly') && (
                <label>
                  <span style={labelStyle}>Days of Week</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 12 }}>
                    {DAYS_OF_WEEK.map((day) => (
                      <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={recurrenceData.daysOfWeek.has(day)}
                          onChange={(e) => {
                            const newDays = new Set(recurrenceData.daysOfWeek)
                            if (e.target.checked) {
                              newDays.add(day)
                            } else {
                              newDays.delete(day)
                            }
                            setRecurrenceData((prev) => ({ ...prev, daysOfWeek: newDays }))
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </label>
              )}

              {recurrenceData.frequency === 'monthly' && (
                <label>
                  <span style={labelStyle}>Day of Month</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    style={inputStyle}
                    value={recurrenceData.dayOfMonth}
                    onChange={(e) => setRecurrenceData((prev) => ({ ...prev, dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) }))}
                  />
                </label>
              )}

              <label>
                <span style={labelStyle}>End After</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio"
                      name="endType"
                      value="occurrences"
                      checked={recurrenceData.endType === 'occurrences'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>
                      <input
                        type="number"
                        min="1"
                        max={MAX_OCCURRENCES}
                        style={{ width: 50, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', marginRight: 6 }}
                        value={recurrenceData.occurrences}
                        onChange={(e) => setRecurrenceData((prev) => ({ ...prev, occurrences: Math.max(1, Math.min(MAX_OCCURRENCES, parseInt(e.target.value) || 1)) }))}
                      />
                      occurrences
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio"
                      name="endType"
                      value="date"
                      checked={recurrenceData.endType === 'date'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>
                      On date
                      <input
                        type="date"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', marginLeft: 6 }}
                        value={recurrenceData.endDate}
                        onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endDate: e.target.value }))}
                      />
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio"
                      name="endType"
                      value="never"
                      checked={recurrenceData.endType === 'never'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    Never (up to {MAX_OCCURRENCES} meetings)
                  </label>
                </div>
              </label>
            </div>
          )}

          <label>
            <span style={labelStyle}>Agenda (optional)</span>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Optional agenda or notes"
            />
          </label>

          <div>
            <span style={labelStyle}>Attendees</span>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {orgMembers.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '3px 4px', borderRadius: 6 }}>
                  <input
                    type="checkbox"
                    checked={attendeeIds.includes(m.id)}
                    onChange={() => toggleAttendee(m.id)}
                  />
                  <span style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                  {m.id === profile?.id && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(you)</span>}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'white', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: 13, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Scheduling…' : 'Schedule Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
