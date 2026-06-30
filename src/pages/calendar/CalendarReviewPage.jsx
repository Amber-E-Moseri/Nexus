import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { hasPermission } from '../../lib/permissions'
import { getMonthEvents, getPendingApprovals, approveEvent, rejectEvent } from '../../features/calendar'
import { createNotification } from '../../features/notifications'
import { useToast } from '../../context/ToastContext'
import EventDetailModal from '../../features/calendar/components/EventDetailModal'

const TABS = ['pending', 'rejected', 'approved']

export default function CalendarReviewPage() {
  const navigate = useNavigate()
  const { effectiveRole, profile } = useAuth()
  const { showToast } = useToast()
  const [authorized, setAuthorized] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [rejectingEventId, setRejectingEventId] = useState(null)
  const [rejectionNote, setRejectionNote] = useState('')

  // Check authorization: super_admin, regional_secretary, and dept_lead get access
  // at the route level. Page-level check also covers users with calendar:write permission.
  useEffect(() => {
    let active = true
    if (['super_admin', 'regional_secretary', 'dept_lead'].includes(effectiveRole)) {
      if (active) setAuthorized(true)
      return () => { active = false }
    }

    hasPermission(profile?.id, 'calendar:write')
      .then((allowed) => { if (active) setAuthorized(allowed) })
      .catch(() => { if (active) setAuthorized(false) })

    return () => { active = false }
  }, [effectiveRole, profile?.id])

  // Redirect if not authorized
  useEffect(() => {
    if (authorized === false) {
      navigate('/calendar')
    }
  }, [authorized, navigate])

  // Load events
  async function loadEvents() {
    if (!authorized) return
    setLoading(true)
    try {
      const pending = await getPendingApprovals()
      setEvents(pending || [])
    } catch (err) {
      console.error('Failed to load events:', err)
      showToast('Failed to load events', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authorized) loadEvents()
  }, [authorized])

  async function handleApprove(event) {
    try {
      await approveEvent(event.id, profile.id)

      // Create notification
      if (event.created_by) {
        await createNotification({
          recipient_id: event.created_by,
          type: 'calendar_event_approved',
          related_resource_type: 'calendar_event',
          related_resource_id: event.id,
          title: `Event approved: ${event.title}`,
          description: 'Your calendar event has been approved.',
        }).catch(() => {})
      }

      showToast('Event approved', { tone: 'success' })
      loadEvents()
    } catch (err) {
      console.error('Failed to approve event:', err)
      showToast('Failed to approve event', { tone: 'error' })
    }
  }

  async function handleReject(event) {
    if (!rejectionNote.trim()) {
      showToast('Please enter a rejection reason', { tone: 'error' })
      return
    }

    try {
      await rejectEvent(event.id, profile.id, rejectionNote)

      // Create notification
      if (event.created_by) {
        await createNotification({
          recipient_id: event.created_by,
          type: 'calendar_event_rejected',
          related_resource_type: 'calendar_event',
          related_resource_id: event.id,
          title: `Event rejected: ${event.title}`,
          description: `Your calendar event was rejected. Reason: ${rejectionNote}`,
        }).catch(() => {})
      }

      showToast('Event rejected', { tone: 'success' })
      setRejectingEventId(null)
      setRejectionNote('')
      loadEvents()
    } catch (err) {
      console.error('Failed to reject event:', err)
      showToast('Failed to reject event', { tone: 'error' })
    }
  }

  if (authorized === null) {
    return <div style={{ padding: '32px', textAlign: 'center' }}>Loading...</div>
  }

  if (!authorized) {
    return null
  }

  const filteredEvents = events.filter((e) => e.status === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
          Pending Events
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Review and approve calendar event submissions.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 500,
              fontSize: '14px',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({events.filter((e) => e.status === tab).length})
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading events...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface-tertiary)',
            color: 'var(--text-secondary)'
          }}
        >
          No {activeTab} events.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: 'var(--card-shadow)'
          }}>
            <thead>
              <tr style={{
                backgroundColor: 'var(--surface-tertiary)',
                borderBottom: '1px solid var(--border)'
              }}>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Title</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Type</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Submitted By</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Department</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Date</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event, idx) => (
                <tr
                  key={event.id}
                  style={{
                    borderBottom: idx === filteredEvents.length - 1 ? 'none' : '1px solid var(--border)',
                    backgroundColor: idx % 2 === 0 ? 'white' : 'var(--surface-tertiary)',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'white' : 'var(--surface-tertiary)'
                  }}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {event.title}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                    {event.event_type}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {event.created_by_name || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {event.department_name || 'Org-wide'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {new Date(event.start_date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    {rejectingEventId === event.id ? (
                      <div style={{ minWidth: '300px' }}>
                        <textarea
                          value={rejectionNote}
                          onChange={(e) => setRejectionNote(e.target.value)}
                          placeholder="Rejection reason..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            marginBottom: '8px',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box'
                          }}
                          rows={2}
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleReject(event)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#DC2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => {
                              setRejectingEventId(null)
                              setRejectionNote('')
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'var(--border)',
                              color: 'var(--text-primary)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {activeTab === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(event)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600
                              }}
                            >
                              ✅ Approve
                            </button>
                            <button
                              onClick={() => setRejectingEventId(event.id)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#F3F4F6',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ❌ Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setSelectedEvent(event)
                            setShowDetailModal(true)
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'var(--surface-secondary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          👁 Preview
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEvent && showDetailModal && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedEvent(null)
          }}
          onApproved={loadEvents}
          canApprove={false}
        />
      )}
    </div>
  )
}
