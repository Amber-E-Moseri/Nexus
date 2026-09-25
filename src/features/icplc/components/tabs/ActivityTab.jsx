import React from 'react'
import { useICPLCActivity } from '../../hooks/useICPLCProfile.js'

export default function ActivityTab({ participantId }) {
  const { data: entries, isLoading, error } = useICPLCActivity(participantId)

  if (isLoading) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Loading…</div>
  if (error) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Error loading activity.</div>
  if (!entries?.length) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>No activity recorded yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            padding: '12px 0',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
              <strong>{entry.action}</strong>
              {entry.description && <span style={{ color: 'var(--text-secondary)' }}> — {entry.description}</span>}
            </div>
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {JSON.stringify(entry.metadata)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
            {new Date(entry.created_at).toLocaleDateString('en-CA', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
