import React, { useState } from 'react'
import { StickyNote, History } from 'lucide-react'
import { Card, EditButton } from './tabUi.jsx'
import { useAuth } from '../../../../hooks/useAuth'
import { useICPLCActivity, useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { describeActivity } from '../../lib/activityFormat.js'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card icon={StickyNote} title="Notes" action={canWrite && !editing ? <EditButton onClick={() => setEditing(true)} label={participant.notes ? 'Edit' : 'Add'} /> : null}>
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
          </>
        )}
      </Card>

      <Card icon={History} title="Activity">
        {isLoading && <div role="status" style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
        {error && <div role="alert" style={{ color: 'var(--text-secondary)' }}>Error loading activity.</div>}
        {!isLoading && !error && !entries?.length && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No activity recorded yet.</div>
        )}
        {entries?.map((entry) => {
          const info = describeActivity(entry)
          return (
            <div key={entry.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                  <strong>{info.title}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}> · {info.actor}</span>
                  {info.bulk && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: '#EEE8F8', color: '#4C2A92', borderRadius: 8, padding: '1px 6px' }}>Bulk</span>
                  )}
                  {info.automatic && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: '#E3EEFB', color: '#1D5FB4', borderRadius: 8, padding: '1px 6px' }}>Auto</span>
                  )}
                </div>
                {info.reason && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{info.reason}</div>}
                {info.changes.length > 0 && (
                  <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {info.changes.map((c) => (
                      <li key={c.label} style={{ fontSize: 12, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{c.label}:</span>{' '}
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)' }}>{c.from}</span>
                        {' → '}
                        <strong>{c.to}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {new Date(entry.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
