import { useEffect, useState } from 'react'
import { Clock, AlertCircle } from 'lucide-react'
import { getPendingApprovals } from '..'

export default function SubmissionsPanel({ onEventClick, refreshTrigger }) {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadPending() {
    setLoading(true)
    try {
      const data = await getPendingApprovals()
      setPending(data || [])
    } catch (err) {
      console.error('Failed to load pending approvals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPending()
  }, [refreshTrigger])

  if (loading) {
    return (
      <div style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        backgroundColor: 'white',
        padding: '16px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '14px'
      }}>
        Loading submissions...
      </div>
    )
  }

  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--border)',
      backgroundColor: 'white',
      overflow: 'hidden',
      boxShadow: 'var(--card-shadow)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface-tertiary)'
      }}>
        <Clock size={18} style={{ color: 'var(--accent)' }} />
        <h3 style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0
        }}>
          Pending Submissions
          {pending.length > 0 && (
            <span style={{
              display: 'inline-block',
              marginLeft: '8px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#FFE5E5',
              color: '#D32F2F',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {pending.length}
            </span>
          )}
        </h3>
      </div>

      <div style={{
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        {pending.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '14px'
          }}>
            <AlertCircle size={32} style={{
              margin: '0 auto 12px',
              color: 'var(--text-tertiary)'
            }} />
            <p style={{ margin: 0 }}>No pending submissions</p>
          </div>
        ) : (
          pending.map((event) => (
            <div
              key={event.id}
              onClick={() => onEventClick?.(event)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                backgroundColor: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-tertiary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <h4 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                  flex: 1
                }}>
                  {event.title}
                </h4>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: '#FFA726',
                  whiteSpace: 'nowrap',
                  padding: '2px 6px',
                  backgroundColor: '#FFF3E0',
                  borderRadius: '4px'
                }}>
                  Pending
                </span>
              </div>

              <p style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                margin: '4px 0 0'
              }}>
                {new Date(event.start_date).toLocaleDateString()} · {event.event_type || 'Event'}
              </p>

              {event.description && (
                <p style={{
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                  margin: '4px 0 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {event.description}
                </p>
              )}

              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px'
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEventClick?.(event)
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: 'var(--surface-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'var(--accent)'
                    e.target.style.color = 'white'
                    e.target.style.borderColor = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'var(--surface-tertiary)'
                    e.target.style.color = 'var(--text-primary)'
                    e.target.style.borderColor = 'var(--border)'
                  }}
                >
                  Review
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
