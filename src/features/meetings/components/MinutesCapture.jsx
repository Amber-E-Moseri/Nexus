import { useState, useEffect } from 'react'
import { useHasPermission } from '../../../hooks/useHasPermission'
import {
  createMinutes,
  getMinutesByMeeting,
  submitMinutes,
  updateMinutesSummary,
  initializeSegmentNotes,
} from '../lib/minutes'
import SegmentNoteCard from './SegmentNoteCard'

export default function MinutesCapture({ meeting, agendaItems, onClose }) {
  const { hasPermission: canSubmit } = useHasPermission('meetings:manage')
  const [minutes, setMinutes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState('')
  const [segments, setSegments] = useState([])

  // Load or create minutes
  useEffect(() => {
    loadMinutes()
  }, [meeting.id])

  async function loadMinutes() {
    try {
      setLoading(true)
      setError(null)

      let minutesData = await getMinutesByMeeting(meeting.id)

      // Create new minutes if doesn't exist
      if (!minutesData) {
        const { data: user } = await supabase.auth.getUser()
        minutesData = await createMinutes(meeting.id, user.user.id)
        await initializeSegmentNotes(minutesData.id, agendaItems)
        minutesData = await getMinutesByMeeting(meeting.id)
      }

      setMinutes(minutesData)
      setSummary(minutesData.summary || '')
      setSegments(minutesData.segments || [])
    } catch (err) {
      setError(err.message)
      console.error('Failed to load minutes:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSummary() {
    if (!minutes) return

    try {
      setSaving(true)
      setError(null)
      await updateMinutesSummary(minutes.id, summary)
      setMinutes({ ...minutes, summary })
    } catch (err) {
      setError(err.message)
      console.error('Failed to save summary:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!minutes) return

    try {
      setSaving(true)
      setError(null)
      await submitMinutes(minutes.id)
      setMinutes({ ...minutes, status: 'submitted' })
      setTimeout(() => onClose(), 1500) // Close after success message
    } catch (err) {
      setError(err.message)
      console.error('Failed to submit minutes:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Loading minutes...
      </div>
    )
  }

  if (!minutes) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#DC3545' }}>
        Failed to load minutes
      </div>
    )
  }

  const isFinalized = minutes.status === 'submitted'

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0C0E18' }}>
              Meeting Minutes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9E9488' }}>
              {meeting.title} • {new Date(meeting.date).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 24,
              color: '#9E9488',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(220, 53, 69, 0.1)',
              border: '1px solid #DC3545',
              borderRadius: 8,
              fontSize: 12,
              color: '#DC3545',
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {minutes.status === 'submitted' && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(39, 174, 96, 0.1)',
              border: '1px solid #27AE60',
              borderRadius: 8,
              fontSize: 12,
              color: '#27AE60',
              marginBottom: 12,
            }}
          >
            ✓ Minutes submitted on {new Date(minutes.updated_at).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Meeting Summary Section */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0C0E18' }}>
          Meeting Summary
        </h2>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={handleSaveSummary}
          disabled={isFinalized}
          placeholder="Add overall meeting summary, key decisions, and outcomes..."
          style={{
            width: '100%',
            minHeight: 120,
            padding: 12,
            border: '1px solid #E5DDD0',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            color: '#0C0E18',
            opacity: isFinalized ? 0.6 : 1,
            cursor: isFinalized ? 'not-allowed' : 'text',
          }}
        />
      </div>

      {/* Segment Notes */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0C0E18' }}>
          Segment Notes
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {segments.map((segment) => (
            <SegmentNoteCard
              key={segment.id}
              segment={segment}
              minutesId={minutes.id}
              meetingId={meeting.id}
              departmentId={meeting.department_id}
              isFinalized={isFinalized}
              onRefresh={loadMinutes}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #E5DDD0' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '12px 16px',
            border: '1px solid #E5DDD0',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: 'white',
            color: '#0C0E18',
            cursor: 'pointer',
          }}
        >
          Close
        </button>

        {!isFinalized && canSubmit && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: '#4C2A92',
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '⏳ Submitting...' : '✓ Submit Minutes'}
          </button>
        )}
      </div>
    </div>
  )
}
