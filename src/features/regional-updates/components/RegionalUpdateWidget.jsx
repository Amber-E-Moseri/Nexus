import { useState } from 'react'
import { useRegionalUpdate } from '../hooks/useRegionalUpdate'
import { useRegionalUpdatesList } from '../hooks/useRegionalUpdatesList'

export function RegionalUpdateWidget() {
  const { update, loading } = useRegionalUpdate()
  const [showPastUpdates, setShowPastUpdates] = useState(false)

  // Don't render if no active update or still loading
  if (loading || !update) {
    return null
  }

  const expiresIn = new Date(update.expires_at) - new Date()
  const daysLeft = Math.ceil(expiresIn / (1000 * 60 * 60 * 24))

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#3A3530' }}>
          {update.content}
        </p>
        <div style={{ fontSize: 12, color: '#9E9488', marginTop: 8 }}>
          Posted by {update.creator_name} on{' '}
          {new Date(update.created_at).toLocaleDateString()}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#B0A696', marginBottom: 10 }}>
        Expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
      </div>

      <button
        onClick={() => setShowPastUpdates(!showPastUpdates)}
        style={{
          fontSize: 12,
          color: '#4C2A92',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
        }}
      >
        {showPastUpdates ? 'Hide' : 'View'} past updates →
      </button>

      {showPastUpdates && <PastUpdatesModal onClose={() => setShowPastUpdates(false)} />}
    </div>
  )
}

// Modal to show past updates
function PastUpdatesModal({ onClose }) {
  const { updates, loading } = useRegionalUpdatesList()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          maxWidth: 500,
          width: '90%',
          maxHeight: '70vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 20, borderBottom: '1px solid #E9E4D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Regional Updates History</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#9E9488',
              padding: 0,
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <p style={{ color: '#9E9488' }}>Loading...</p>
          ) : updates.length === 0 ? (
            <p style={{ color: '#9E9488' }}>No regional updates yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {updates.map((u) => (
                <div
                  key={u.id}
                  style={{
                    padding: 12,
                    border: '1px solid #E9E4D8',
                    borderRadius: 8,
                    backgroundColor: u.is_expired ? '#F5F3F1' : '#FFFBF8',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    {u.is_expired && (
                      <span
                        style={{
                          fontSize: 11,
                          backgroundColor: '#E9E4D8',
                          color: '#6B5F52',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        Expired
                      </span>
                    )}
                    {!u.is_expired && (
                      <span
                        style={{
                          fontSize: 11,
                          backgroundColor: '#D4E9D0',
                          color: '#3F6D34',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, margin: '6px 0', color: '#3A3530' }}>
                    {u.content}
                  </p>
                  <div style={{ fontSize: 12, color: '#9E9488', marginTop: 6 }}>
                    Expires {new Date(u.expires_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
