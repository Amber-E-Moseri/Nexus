import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { getPendingIntegrationRequests, approveIntegrationRequest, rejectIntegrationRequest } from '../index'

export default function IntegrationRequestsPanel({ departmentId }) {
  const { user, profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    loadRequests()
  }, [departmentId])

  async function loadRequests() {
    try {
      setLoading(true)
      const data = await getPendingIntegrationRequests(departmentId)
      setRequests(data)
    } catch (error) {
      console.error('Failed to load integration requests:', error)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(requestId) {
    try {
      await approveIntegrationRequest(requestId, user.id)
      setRequests(requests.filter((r) => r.id !== requestId))
    } catch (error) {
      alert(`Failed to approve: ${error.message}`)
    }
  }

  async function handleReject(requestId) {
    try {
      await rejectIntegrationRequest(requestId, user.id, rejectionReason)
      setRejecting(null)
      setRejectionReason('')
      setRequests(requests.filter((r) => r.id !== requestId))
    } catch (error) {
      alert(`Failed to reject: ${error.message}`)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading requests...</div>
  }

  if (requests.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: 13 }}>
        No pending integration requests
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {requests.map((request) => (
        <div
          key={request.id}
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: '#FFFBF7',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {request.display_name}
              </h4>
              <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>{request.requested_by?.name || request.requested_by?.email}</span>
                {' '}requested a {request.integration_type} integration
              </p>
              {request.description && (
                <p style={{ margin: '0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {request.description}
                </p>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {new Date(request.created_at).toLocaleDateString()}
            </div>
          </div>

          {rejecting === request.id ? (
            <div style={{ marginTop: 12, padding: 12, background: 'white', borderRadius: 8, border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Rejection Reason (optional)
                </span>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Tell them why you're rejecting this request..."
                  rows={3}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setRejecting(null)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(request.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 8,
                    background: '#C94830',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleApprove(request.id)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  background: 'var(--accent)',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => setRejecting(request.id)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #F3B6A8',
                  borderRadius: 8,
                  background: '#FEE2E2',
                  color: '#C94830',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✕ Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
