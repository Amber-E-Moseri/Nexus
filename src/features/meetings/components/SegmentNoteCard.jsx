import { useState } from 'react'
import { upsertSegmentNotes, updateSegmentDecisions } from '../lib/minutes'
import ActionItemForm from './ActionItemForm'

export default function SegmentNoteCard({ segment, minutesId, meetingId, departmentId, isFinalized, onRefresh }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [notes, setNotes] = useState(segment.notes || '')
  const [decisions, setDecisions] = useState(segment.decisions || '')
  const [saving, setSaving] = useState(false)

  async function handleSaveNotes() {
    if (isFinalized) return

    try {
      setSaving(true)
      await upsertSegmentNotes(minutesId, segment.segment_id, segment.segment_name, notes)
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDecisions() {
    if (isFinalized) return

    try {
      setSaving(true)
      await updateSegmentDecisions(segment.id, decisions)
    } catch (err) {
      console.error('Failed to save decisions:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid #E5DDD0',
        borderRadius: 12,
        overflow: 'hidden',
        background: isExpanded ? '#FCFAF6' : 'white',
      }}
    >
      {/* Header / Collapsed View */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '16px',
          border: 'none',
          background: isExpanded ? '#F5F3F0' : 'white',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0C0E18' }}>
            {segment.segment_name}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9E9488' }}>
            {notes ? '📝 Notes added' : 'No notes yet'}
            {segment.actions && segment.actions.length > 0 && ` • ${segment.actions.length} action item(s)`}
          </p>
        </div>
        <span style={{ fontSize: 18, color: '#9E9488' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded View */}
      {isExpanded && (
        <div style={{ padding: '16px', borderTop: '1px solid #E5DDD0', background: '#FCFAF6' }}>
          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#0C0E18' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              disabled={isFinalized}
              placeholder="Add notes about this segment..."
              style={{
                width: '100%',
                minHeight: 80,
                padding: 10,
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

          {/* Decisions */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#0C0E18' }}>
              Key Decisions
            </label>
            <textarea
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              onBlur={handleSaveDecisions}
              disabled={isFinalized}
              placeholder="Record key decisions made during this segment..."
              style={{
                width: '100%',
                minHeight: 80,
                padding: 10,
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

          {/* Action Items */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#0C0E18' }}>
              Action Items ({segment.actions ? segment.actions.length : 0})
            </h4>
            {segment.actions && segment.actions.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segment.actions.map((action) => (
                  <div
                    key={action.id}
                    style={{
                      padding: 10,
                      background: 'white',
                      border: '1px solid #E5DDD0',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {action.description}
                    </div>
                    <div style={{ fontSize: 11, color: '#9E9488' }}>
                      {action.user ? `Assigned to: ${action.user.name}` : 'Unassigned'}
                      {action.due_date && ` • Due: ${new Date(action.due_date).toLocaleDateString()}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isFinalized && (
              <ActionItemForm
                segmentId={segment.id}
                meetingId={meetingId}
                departmentId={departmentId}
                onActionCreated={onRefresh}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
