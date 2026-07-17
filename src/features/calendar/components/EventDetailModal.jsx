import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { approveEvent, rejectEvent } from '..'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import { supabase } from '../../../lib/supabase'
import DeliverablesSection from './DeliverablesSection'

export default function EventDetailModal({ event, onClose, onApproved, canApprove = false }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isProgramsMember, setIsProgramsMember] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProgramsFlag() {
      if (!profile?.department_id) {
        if (!cancelled) setIsProgramsMember(false)
        return
      }

      // Match RLS check from is_programs_team() RPC (exact case-insensitive name = 'programs')
      // not the is_programs column fuzzy-match (ilike '%programs%')
      const { data } = await supabase
        .from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .maybeSingle()

      if (!cancelled) {
        setIsProgramsMember(Boolean(data?.name && data.name.toLowerCase() === 'programs'))
      }
    }

    loadProgramsFlag()
    return () => {
      cancelled = true
    }
  }, [profile?.department_id])

  async function handleApprove() {
    if (!canApprove || !event) return
    setLoading(true)
    try {
      await approveEvent(event.id)
      showToast('Event approved and creator notified', { tone: 'success' })
      onApproved?.()
      onClose()
    } catch (err) {
      console.error('Failed to approve event:', err)
      showToast('Failed to approve event', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    if (!canApprove || !event || !rejectionReason.trim()) {
      showToast('Please provide a rejection reason', { tone: 'error' })
      return
    }
    setLoading(true)
    try {
      await rejectEvent(event.id, rejectionReason)
      showToast('Event rejected and creator notified', { tone: 'success' })
      onApproved?.()
      onClose()
    } catch (err) {
      console.error('Failed to reject event:', err)
      showToast('Failed to reject event', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }


  if (!event) return null

  const startDate = new Date(event.start_date)
  const endDate = new Date(event.end_date)
  const isPending = event.status === 'pending'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px'
        }}>
          <div>
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '6px',
              backgroundColor: isPending ? '#FFF3CD' : event.status === 'approved' ? '#D4EDDA' : '#F8D7DA',
              color: isPending ? '#856404' : event.status === 'approved' ? '#155724' : '#721C24',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '12px',
              textTransform: 'capitalize'
            }}>
              {event.status}
            </div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0
            }}>
              {event.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        <div style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          <div style={{ marginBottom: '16px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Description</strong>
            <p style={{ margin: '8px 0 0' }}>{event.description || '—'}</p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Start Date</strong>
              <p style={{ margin: '4px 0 0' }}>
                {startDate.toLocaleDateString()} {event.all_day ? '' : `@ ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>End Date</strong>
              <p style={{ margin: '4px 0 0' }}>
                {endDate.toLocaleDateString()} {event.all_day ? '' : `@ ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
          </div>

          {event.location && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Location</strong>
              <p style={{ margin: '4px 0 0' }}>{event.location}</p>
            </div>
          )}

          {event.zoom_join_url && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Zoom Link</strong>
              <p style={{ margin: '4px 0 0' }}>
                <a href={event.zoom_join_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                  Join Meeting
                </a>
              </p>
            </div>
          )}

          {event.event_type && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Event Type</strong>
              <p style={{ margin: '4px 0 0', textTransform: 'capitalize' }}>{event.event_type}</p>
            </div>
          )}

          {event.recurrence_rule && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>🔁 Recurring</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>{event.recurrence_rule}</p>
            </div>
          )}
        </div>


        <div style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          {event.rejection_note && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#F8D7DA',
              borderRadius: '8px',
              borderLeft: '4px solid #F5C6CB'
            }}>
              <strong style={{ color: '#721C24' }}>Rejection Reason</strong>
              <p style={{ margin: '4px 0 0', color: '#721C24' }}>{event.rejection_note}</p>
            </div>
          )}
        </div>

        {/* Dual-gate: Programs-only UI convenience here, RLS is the real security gate. */}
        {isProgramsMember ? (
          <DeliverablesSection eventId={event.id} departmentId={event.department_id ?? null} />
        ) : null}

        {/* Approval Form */}
        {isPending && canApprove && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: 'var(--surface-tertiary)',
            borderRadius: '8px'
          }}>
            {!showRejectForm ? (
              <div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', margin: 0 }}>
                  This event is pending approval.
                </p>
              </div>
            ) : (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}>
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Why are you rejecting this event?"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: 'var(--surface-tertiary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--text-primary)'
            }}
          >
            Close
          </button>

          {isPending && canApprove && (
            <>
              <button
                onClick={handleApprove}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Processing...' : 'Approve'}
              </button>

              <button
                onClick={() => {
                  if (showRejectForm && rejectionReason.trim()) {
                    handleReject()
                  } else {
                    setShowRejectForm(!showRejectForm)
                  }
                }}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: showRejectForm ? '#f44336' : 'var(--surface-secondary)',
                  color: showRejectForm ? 'white' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Processing...' : showRejectForm ? 'Confirm Rejection' : 'Reject'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
