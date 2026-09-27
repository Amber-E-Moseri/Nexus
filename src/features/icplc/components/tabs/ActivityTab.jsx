import React, { useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useICPLCActivity, useUpdateProfile } from '../../hooks/useICPLCProfile.js'

/**
 * Notes & Activity. Notes use the existing icplc_participants.notes column;
 * activity is read from the real activity_log — nothing is fabricated.
 */
export default function ActivityTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const { data: entries, isLoading, error } = useICPLCActivity(participant.id)
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(participant.notes || '')

  async function saveNotes() {
    const next = notes.trim() || null
    if (next !== (participant.notes || null)) {
      await updateProfile.mutateAsync({ id: participant.id, fields: { notes: next }, userId: authProfile?.id })
    }
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section aria-labelledby="icplc-notes-h">
        <h4 id="icplc-notes-h" className="icplc-section-title">Notes</h4>
        {editing && canWrite ? (
          <>
            <label className="icplc-label" htmlFor="icplc-notes-input">Staff notes</label>
            <textarea
              id="icplc-notes-input"
              className="icplc-input"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            {updateProfile.isError && (
              <div role="alert" style={{ fontSize: 12, color: '#991B1B', marginTop: 6 }}>
                Could not save notes: {updateProfile.error?.message}
              </div>
            )}
            <div className="icplc-actions" style={{ marginTop: 8 }}>
              <button type="button" className="icplc-btn icplc-btn-primary" onClick={saveNotes} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'Saving…' : 'Save notes'}
              </button>
              <button type="button" className="icplc-btn" onClick={() => { setNotes(participant.notes || ''); setEditing(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', color: participant.notes ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {participant.notes || 'No notes yet.'}
            </p>
            {canWrite && (
              <button type="button" className="icplc-btn" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>
                {participant.notes ? 'Edit notes' : 'Add note'}
              </button>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="icplc-activity-h">
        <h4 id="icplc-activity-h" className="icplc-section-title">Activity</h4>
        {isLoading && <div role="status" style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
        {error && <div role="alert" style={{ color: 'var(--text-secondary)' }}>Error loading activity.</div>}
        {!isLoading && !error && !entries?.length && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No activity recorded yet.</div>
        )}
        {entries?.map((entry) => (
          <div key={entry.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                <strong>{entry.action}</strong>
                {entry.description && <span style={{ color: 'var(--text-secondary)' }}> — {entry.description}</span>}
              </div>
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, overflowWrap: 'anywhere' }}>
                  {JSON.stringify(entry.metadata)}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {new Date(entry.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
