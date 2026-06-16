import * as Dialog from '@radix-ui/react-dialog'
import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDeptMembers } from '../../hooks/useDeptMembers'
import { useMeetings } from './MeetingsContext'

const MEETING_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'team', label: 'Team' },
  { value: 'media', label: 'Media' },
  { value: 'department', label: 'Department' },
]

function toLocalDateTime(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function MeetingModal({ departmentId, onClose }) {
  const { profile } = useAuth()
  const { addMeeting } = useMeetings()
  const members = useDeptMembers(departmentId)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => toLocalDateTime(new Date().toISOString()))
  const [meetingType, setMeetingType] = useState('general')
  const [summary, setSummary] = useState('')
  const [minutes, setMinutes] = useState('')
  const [transcript, setTranscript] = useState('')
  const [zoomJoinUrl, setZoomJoinUrl] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [attendeeIds, setAttendeeIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const attendanceLabel = useMemo(() => {
    if (attendeeIds.length === 0) return 'No attendees selected'
    if (attendeeIds.length === 1) return '1 attendee selected'
    return `${attendeeIds.length} attendees selected`
  }, [attendeeIds.length])

  function toggleAttendee(memberId) {
    setAttendeeIds((previous) =>
      previous.includes(memberId) ? previous.filter((id) => id !== memberId) : [...previous, memberId],
    )
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Meeting title is required.')
      return
    }

    if (!date) {
      setError('Meeting date is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await addMeeting({
        title: title.trim(),
        department_id: departmentId,
        date: new Date(date).toISOString(),
        meeting_type: meetingType,
        summary: summary.trim() || null,
        minutes: minutes.trim() || null,
        transcript: transcript.trim() || null,
        zoom_join_url: zoomJoinUrl.trim() || null,
        drive_url: driveUrl.trim() || null,
        created_by: profile?.id,
        attendanceUserIds: attendeeIds,
      })
      onClose()
    } catch (nextError) {
      setError(nextError.message)
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12, 14, 24, 0.48)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(760px, 94vw)',
            maxHeight: '90vh',
            overflow: 'hidden',
            borderRadius: 18,
            background: 'white',
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <Dialog.Title style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                Log meeting
              </Dialog.Title>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                Save the completed meeting record and link follow-up tasks back to it.
              </div>
            </div>
            <Dialog.Close
              aria-label="Close"
              style={{ border: 'none', background: 'transparent', fontSize: 20, color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {error ? (
              <div style={{ marginBottom: 14, borderRadius: 10, background: 'var(--coral-light)', padding: '10px 12px', fontSize: 12, color: 'var(--coral-dark)' }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1.5fr) minmax(220px, 1fr) minmax(180px, 1fr)' }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Weekly Team Sync" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Meeting type</label>
                <select value={meetingType} onChange={(event) => setMeetingType(event.target.value)} style={inputStyle}>
                  {MEETING_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
              <div>
                <label style={labelStyle}>Drive URL</label>
                <input value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} placeholder="https://drive.google.com/..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Zoom URL</label>
                <input value={zoomJoinUrl} onChange={(event) => setZoomJoinUrl(event.target.value)} placeholder="https://zoom.us/..." style={inputStyle} />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Summary</label>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} placeholder="Paste the final meeting summary from Meeting OS or Claude." style={textareaStyle} />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Minutes</label>
              <textarea value={minutes} onChange={(event) => setMinutes(event.target.value)} rows={6} placeholder="Store the final minutes text or key decisions here." style={textareaStyle} />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Transcript</label>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={5} placeholder="Optional transcript excerpt or pasted transcript." style={textareaStyle} />
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={labelStyle}>Attendance</div>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{attendanceLabel}</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                {members.map((member) => {
                  const checked = attendeeIds.includes(member.id)
                  return (
                    <label
                      key={member.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        borderRadius: 10,
                        border: checked ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: checked ? 'rgba(108, 90, 234, 0.06)' : 'white',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleAttendee(member.id)} style={{ accentColor: 'var(--accent)' }} />
                      <span>{member.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)', padding: '14px 20px' }}>
            <Dialog.Close
              style={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'white',
                padding: '8px 14px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save meeting'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
}

const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.6,
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}
