import { useState } from 'react'
import { useMeetingDocGeneration } from '../hooks/useMeetingDocGeneration'

const FS = {
  purple: '#4C2A92',
  navy:   '#18122E',
  sage:   '#2D8653',
  sageL:  'rgba(45,134,83,.12)',
  border: '#E5DDD0',
  borderL:'#EDE8DC',
  surface:'#FAFAF8',
  text:   '#1C1C1C',
  muted:  '#7A6F5E',
}

export default function GenerateMeetingDocButton({ meetingId, meeting, actionItems = [], onSuccess }) {
  const { generateAndUploadDoc, isGenerating } = useMeetingDocGeneration()
  const [status, setStatus] = useState(null) // null | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [docUrl, setDocUrl]   = useState(meeting?.doc_drive_url ?? null)

  async function handleGenerate() {
    setStatus(null)
    setMessage('')
    try {
      const result = await generateAndUploadDoc({
        meetingId,
        title:         meeting?.title,
        date:          meeting?.date,
        attendees:     meeting?.attendees ?? '',
        summary:       meeting?.summary ?? '',
        meeting_notes: meeting?.meeting_notes ?? '',
        meetingType:   meeting?.meeting_type ?? 'meeting',
        actionItems:   actionItems.map(t => ({
          action:   t.title || t.action,
          owner:    t.assignee?.name || t.owner || 'Unassigned',
          due_date: t.due_date,
          priority: t.priority ?? 'medium',
        })),
      })

      setDocUrl(result.docUrl)
      setStatus('success')
      setMessage('Doc generated and uploaded to Drive!')
      window.open(result.docUrl, '_blank', 'noopener,noreferrer')
      onSuccess?.(result)
      setTimeout(() => setStatus(null), 4000)
    } catch (err) {
      console.error('[GenerateMeetingDocButton]', err)
      setStatus('error')
      setMessage(err.message || 'Failed to generate doc')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            padding: '9px 18px',
            border: 'none',
            borderRadius: 8,
            background: isGenerating ? FS.muted : FS.purple,
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            transition: 'background .15s',
          }}
        >
          {isGenerating ? '⏳ Generating…' : '📄 Generate & Upload Doc'}
        </button>

        {docUrl && !isGenerating && (
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '9px 16px', border: `1px solid ${FS.border}`, borderRadius: 8, background: FS.surface, color: FS.navy, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            🔗 Open Doc
          </a>
        )}
      </div>

      {status === 'success' && (
        <div style={{ padding: '9px 14px', borderRadius: 8, background: FS.sageL, color: FS.sage, fontSize: 12, fontWeight: 600, borderLeft: `3px solid ${FS.sage}` }}>
          ✅ {message}
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: '9px 14px', borderRadius: 8, background: '#FEE8E6', color: '#C73B2B', fontSize: 12, borderLeft: '3px solid #C73B2B' }}>
          ❌ {message}
        </div>
      )}
    </div>
  )
}
