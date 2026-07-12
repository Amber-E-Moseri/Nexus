import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useMeetings } from '../MeetingsContext'
import { supabase } from '../../../lib/supabase'
import AudioTranscriptionPanel from './AudioTranscriptionPanel'
import GenerateMeetingDocButton from './GenerateMeetingDocButton'

const MEETING_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'regional_group', label: 'Regional Group' },
  { value: 'staff_meeting', label: 'Staff Meeting' },
  { value: 'department_meeting', label: 'Department Meeting' },
]

function toLocalDateTime(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function MeetingModal({ departmentId, onClose }) {
  const { profile } = useAuth()
  const { addMeeting, editMeeting } = useMeetings()
  const [members, setMembers] = useState([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => toLocalDateTime(new Date().toISOString()))
  const [meetingType, setMeetingType] = useState('general')
  const [summary, setSummary] = useState('')
  const [minutes, setMinutes] = useState('')
  const [zoomJoinUrl, setZoomJoinUrl] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [attendeeIds, setAttendeeIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Log meeting is meant for meetings that already happened without ever going
  // through a "plan meeting" flow. Recording, AI extraction, and Drive export
  // all need a real meeting row to attach to, so we create a draft row the
  // moment a title is committed (on blur) instead of gating those tools behind
  // a separate planning step.
  const [savedMeeting, setSavedMeeting] = useState(null)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [actionItems, setActionItems] = useState([])

  useEffect(() => {
    let active = true
    supabase
      .from('users')
      .select('id, name, email, department_id')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => { if (active) setMembers(data ?? []) })
    return () => { active = false }
  }, [])

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

  async function ensureDraftMeeting() {
    if (savedMeeting || creatingDraft || !title.trim()) return

    setCreatingDraft(true)
    setError(null)

    try {
      const created = await addMeeting({
        title: title.trim(),
        department_id: departmentId,
        date: new Date(date).toISOString(),
        meeting_type: meetingType,
        created_by: profile?.id,
      })
      setSavedMeeting(created)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setCreatingDraft(false)
    }
  }

  async function fetchActionItems() {
    if (!savedMeeting?.id) return
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title, status, due_date, assignee:users!assignee_id(id, name)')
      .eq('meeting_id', savedMeeting.id)
      .order('created_at', { ascending: true })
    if (!fetchError) setActionItems(data ?? [])
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
      if (savedMeeting?.id) {
        await editMeeting(savedMeeting.id, {
          title: title.trim(),
          date: new Date(date).toISOString(),
          meeting_type: meetingType,
          summary: summary.trim() || null,
          minutes: minutes.trim() || null,
          zoom_join_url: zoomJoinUrl.trim() || null,
          drive_url: driveUrl.trim() || null,
        })

        await supabase.from('meeting_attendance').delete().eq('meeting_id', savedMeeting.id)
        if (attendeeIds.length > 0) {
          await supabase.from('meeting_attendance').insert(
            attendeeIds.map((userId) => ({
              meeting_id: savedMeeting.id,
              user_id: userId,
              status: 'present',
            })),
          )
        }
      } else {
        await addMeeting({
          title: title.trim(),
          department_id: departmentId,
          date: new Date(date).toISOString(),
          meeting_type: meetingType,
          summary: summary.trim() || null,
          minutes: minutes.trim() || null,
          zoom_join_url: zoomJoinUrl.trim() || null,
          drive_url: driveUrl.trim() || null,
          created_by: profile?.id,
          attendanceUserIds: attendeeIds,
        })
      }
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
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={ensureDraftMeeting}
                  placeholder="Weekly Team Sync"
                  style={inputStyle}
                />
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

            <div style={{ marginTop: 18 }}>
              <label style={labelStyle}>Recording, transcript &amp; AI extraction</label>
              {!savedMeeting ? (
                <div style={{ borderRadius: 10, border: '1px dashed var(--border)', padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {creatingDraft
                    ? 'Setting up…'
                    : 'Enter a title above, then click out of the field — this unlocks recording, audio upload, transcript paste, AI extraction, action-item creation, and Drive export below. No separate "plan meeting" step required.'}
                </div>
              ) : (
                <>
                  <AudioTranscriptionPanel
                    meetingId={savedMeeting.id}
                    departmentId={departmentId}
                    canRecord
                    onTranscriptionComplete={({ transcript }) => setSummary(transcript)}
                    onActionItemsExtracted={fetchActionItems}
                  />

                  {actionItems.length > 0 ? (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {actionItems.length} action item{actionItems.length === 1 ? '' : 's'} created from this meeting so far.
                    </div>
                  ) : null}

                  <div style={{ marginTop: 16, borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📄 Save to Drive</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      Generates a formatted Google Doc with the summary and action items, uploaded to Drive automatically.
                    </div>
                    <GenerateMeetingDocButton
                      meetingId={savedMeeting.id}
                      meeting={{ ...savedMeeting, title, date, summary, minutes }}
                      actionItems={actionItems}
                      onSuccess={(result) => setDriveUrl(result.docUrl)}
                    />
                  </div>
                </>
              )}
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
