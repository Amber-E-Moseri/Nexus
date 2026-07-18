import { useEffect, useState } from 'react'
import { useMeetingDocGeneration } from '../hooks/useMeetingDocGeneration'
import { getMeetingDocConnectionStatus, getMeetingDocConnectOAuthUrl } from '../lib/meetingDocConnection'
import { sanitizeMeetingDate } from '../lib/meetings'

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
  amber:  '#F59E0B',
  amberL: 'rgba(245,158,11,.12)',
}

export default function GenerateMeetingDocButton({ meetingId, meeting, actionItems = [], onSuccess }) {
  const { generateAndUploadDoc, isGenerating } = useMeetingDocGeneration()
  const [connStatus, setConnStatus] = useState(null) // null=loading, 'connected', 'not_connected', 'reauth_required'
  const [genStatus, setGenStatus]   = useState(null) // null | 'success' | 'error'
  const [message, setMessage]       = useState('')
  const [docUrl, setDocUrl]         = useState(meeting?.doc_drive_url ?? null)

  useEffect(() => {
    getMeetingDocConnectionStatus()
      .then((s) => {
        if (!s?.connected) setConnStatus('not_connected')
        else if (s.needs_reauth) setConnStatus('reauth_required')
        else setConnStatus('connected')
      })
      .catch(() => setConnStatus('connected')) // fail open — let user try and see error
  }, [])

  async function handleGenerate() {
    setGenStatus(null)
    setMessage('')
    try {
      const result = await generateAndUploadDoc({
        meetingId,
        title:         meeting?.title,
        date:          sanitizeMeetingDate(meeting?.date),
        attendees:     meeting?.attendees ?? '',
        decisions:      meeting?.decisions ?? '',
        detailed_notes: meeting?.meeting_notes ?? '',
        minutes:        meeting?.minutes ?? '',
        next_steps:     meeting?.next_steps ?? '',
        meetingType:    meeting?.meeting_type ?? 'meeting',
        actionItems:   actionItems.map(t => ({
          action:   t.title || t.action,
          owner:    t.assignee?.name || t.owner || 'Unassigned',
          due_date: t.due_date,
          priority: t.priority ?? 'medium',
        })),
      })

      setDocUrl(result.docUrl)
      setGenStatus('success')
      setMessage('Doc generated and uploaded to Drive!')
      window.open(result.docUrl, '_blank', 'noopener,noreferrer')
      onSuccess?.(result)
      setTimeout(() => setGenStatus(null), 4000)
    } catch (err) {
      console.error('[GenerateMeetingDocButton]', err)
      const msg = err.message || 'Failed to generate doc'
      // Surface connection errors as a connect prompt instead of a raw error
      if (msg === 'not_connected' || msg === 'reauth_required') {
        setConnStatus(msg)
        return
      }
      setGenStatus('error')
      setMessage(msg)
    }
  }

  // Not-connected / needs-reauth state — show connect prompt
  if (connStatus === 'not_connected' || connStatus === 'reauth_required') {
    const isReauth = connStatus === 'reauth_required'
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${FS.border}`, background: FS.amberL, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: FS.navy }}>
          {isReauth ? '⚠️ Drive connection expired' : '🔗 Google Drive not connected'}
        </div>
        <div style={{ fontSize: 12, color: FS.muted }}>
          {isReauth
            ? 'The Google Drive connection needs to be refreshed. A super admin can reconnect it in Calendar Settings.'
            : 'A super admin needs to connect Google Drive in Calendar Settings to enable doc uploads.'}
        </div>
        <a
          href="/calendar/settings"
          style={{ fontSize: 12, fontWeight: 700, color: FS.purple, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Go to Calendar Settings →
        </a>
      </div>
    )
  }

  // Loading connection status
  if (connStatus === null) {
    return (
      <div style={{ padding: '9px 18px', borderRadius: 8, background: FS.surface, border: `1px solid ${FS.border}`, fontSize: 13, color: FS.muted }}>
        Checking Drive connection…
      </div>
    )
  }

  // Connected — normal generate button
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            padding:    '9px 18px',
            border:     'none',
            borderRadius: 8,
            background: isGenerating ? FS.muted : FS.purple,
            color:      '#fff',
            fontFamily: 'inherit',
            fontSize:   13,
            fontWeight: 700,
            cursor:     isGenerating ? 'not-allowed' : 'pointer',
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

      {genStatus === 'success' && (
        <div style={{ padding: '9px 14px', borderRadius: 8, background: FS.sageL, color: FS.sage, fontSize: 12, fontWeight: 600, borderLeft: `3px solid ${FS.sage}` }}>
          ✅ {message}
        </div>
      )}

      {genStatus === 'error' && (
        <div style={{ padding: '9px 14px', borderRadius: 8, background: '#FEE8E6', color: '#C73B2B', fontSize: 12, borderLeft: '3px solid #C73B2B' }}>
          ❌ {message}
        </div>
      )}
    </div>
  )
}
