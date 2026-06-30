import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

const FS = {
  purple:   '#4C2A92',
  navy:     '#18122E',
  surface:  '#FAFAF8',
  border:   '#E5DDD0',
  borderL:  '#EDE8DC',
  text:     '#1C1C1C',
  muted:    '#7A6F5E',
}

export default function MeetingSummaryEditor({ meetingId, initialSummary = '', initialNotes = '', onSave }) {
  const displayed = initialNotes || initialSummary || ''
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft]         = useState('')
  const [isSaving, setIsSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')

  function openEdit() {
    setDraft(initialNotes || '')
    setSaveError('')
    setIsEditing(true)
  }

  function cancel() {
    setIsEditing(false)
    setSaveError('')
  }

  async function save() {
    setIsSaving(true)
    setSaveError('')
    try {
      const { error } = await supabase
        .from('meetings')
        .update({ meeting_notes: draft })
        .eq('id', meetingId)
      if (error) throw error
      onSave?.(draft)
      setIsEditing(false)
    } catch (err) {
      console.error('[MeetingSummaryEditor] save failed:', err)
      setSaveError(err.message || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={{ background: FS.surface, border: `1px solid ${FS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${FS.borderL}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: FS.text }}>📋 Summary & Key Points</div>
          <div style={{ fontSize: 11, color: FS.muted, marginTop: 2 }}>
            {initialNotes ? 'Edited summary' : 'AI-generated summary · click Edit to refine'}
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={openEdit}
            style={{ padding: '7px 13px', border: `1px solid ${FS.border}`, borderRadius: 6, background: FS.surface, color: FS.navy, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            ✏️ Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Summarize what was discussed and key takeaways…"
            rows={8}
            style={{ width: '100%', minHeight: 250, padding: '12px 14px', border: `1px solid ${FS.border}`, borderRadius: 8, fontSize: 13, color: FS.text, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box', background: '#fff' }}
          />
          {saveError && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEE8E6', color: '#C73B2B', fontSize: 12, borderLeft: '3px solid #C73B2B' }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={isSaving}
              style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: FS.purple, color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}
            >
              {isSaving ? 'Saving…' : '💾 Save'}
            </button>
            <button
              onClick={cancel}
              disabled={isSaving}
              style={{ padding: '8px 16px', border: `1px solid ${FS.border}`, borderRadius: 6, background: FS.surface, color: FS.muted, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 16px', maxHeight: 280, overflowY: 'auto' }}>
          {displayed ? (
            <p style={{ margin: 0, fontSize: 13, color: FS.text, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{displayed}</p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: FS.muted, fontStyle: 'italic' }}>
              No summary yet. Click Edit to write one, or run AI Extraction first.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
