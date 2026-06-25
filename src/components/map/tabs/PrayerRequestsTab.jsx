import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export function PrayerRequestsTab({ campusId, requests, onRequestsChange }) {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('prayer_requests')
        .insert({
          campus_id: campusId,
          user_id: user?.id || null,
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          created_at: new Date().toISOString(),
          resolved_at: null,
        })
        .select()

      if (!error) {
        setFormData({ title: '', description: '' })
        setShowForm(false)
        if (data?.[0]) {
          onRequestsChange((prev) => [data[0], ...prev])
        }
      }
    } catch (err) {
      console.error('Error creating prayer request:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleResolve = async (requestId, isResolved) => {
    try {
      const { error } = await supabase
        .from('prayer_requests')
        .update({
          resolved_at: isResolved ? null : new Date().toISOString(),
        })
        .eq('id', requestId)

      if (!error) {
        onRequestsChange((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, resolved_at: isResolved ? null : new Date().toISOString() }
              : r
          )
        )
      }
    } catch (err) {
      console.error('Error updating prayer request:', err)
    }
  }

  const handleDelete = async (requestId) => {
    if (!confirm('Delete this prayer request?')) return

    try {
      const { error } = await supabase
        .from('prayer_requests')
        .delete()
        .eq('id', requestId)

      if (!error) {
        onRequestsChange((prev) => prev.filter((r) => r.id !== requestId))
      }
    } catch (err) {
      console.error('Error deleting prayer request:', err)
    }
  }

  const activeRequests = requests.filter((r) => !r.resolved_at)
  const resolvedRequests = requests.filter((r) => r.resolved_at)

  return (
    <div className="blw-prayer-requests-tab">
      <div className="blw-requests-header">
        <h3>Prayer Requests</h3>
        <button
          className="blw-requests-btn-new"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '✕ Cancel' : '+ New Request'}
        </button>
      </div>

      {showForm && (
        <form className="blw-request-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Prayer request title..."
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="blw-request-input-title"
          />
          <textarea
            placeholder="More details (optional)..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="blw-request-input-desc"
            rows={3}
          />
          <button
            type="submit"
            disabled={!formData.title.trim() || saving}
            className="blw-request-btn-submit"
          >
            {saving ? 'Saving...' : 'Add Request'}
          </button>
        </form>
      )}

      {activeRequests.length > 0 && (
        <div className="blw-requests-section">
          <h4 className="blw-requests-section-title">Active ({activeRequests.length})</h4>
          <div className="blw-requests-list">
            {activeRequests.map((req) => (
              <div key={req.id} className="blw-request-card">
                <div className="blw-request-card-header">
                  <h5 className="blw-request-title">{req.title}</h5>
                  <span className="blw-request-badge-active">🙏 Active</span>
                </div>
                {req.description && (
                  <p className="blw-request-description">{req.description}</p>
                )}
                <div className="blw-request-footer">
                  <span className="blw-request-date">
                    {formatDate(req.created_at)}
                  </span>
                  <div className="blw-request-actions">
                    <button
                      className="blw-request-btn-small blw-request-btn-resolve"
                      onClick={() => handleResolve(req.id, false)}
                      title="Mark as resolved"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="blw-request-btn-small blw-request-btn-delete"
                      onClick={() => handleDelete(req.id)}
                      title="Delete"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolvedRequests.length > 0 && (
        <div className="blw-requests-section">
          <h4 className="blw-requests-section-title">Resolved ({resolvedRequests.length})</h4>
          <div className="blw-requests-list">
            {resolvedRequests.map((req) => (
              <div key={req.id} className="blw-request-card blw-request-card-resolved">
                <div className="blw-request-card-header">
                  <h5 className="blw-request-title">{req.title}</h5>
                  <span className="blw-request-badge-resolved">✓ Resolved</span>
                </div>
                {req.description && (
                  <p className="blw-request-description">{req.description}</p>
                )}
                <div className="blw-request-footer">
                  <span className="blw-request-date">
                    Resolved {formatDate(req.resolved_at)}
                  </span>
                  <div className="blw-request-actions">
                    <button
                      className="blw-request-btn-small blw-request-btn-unresolve"
                      onClick={() => handleResolve(req.id, true)}
                      title="Mark as active"
                    >
                      ↺
                    </button>
                    <button
                      className="blw-request-btn-small blw-request-btn-delete"
                      onClick={() => handleDelete(req.id)}
                      title="Delete"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && !showForm && (
        <div className="blw-empty-state">
          <p>No prayer requests yet</p>
          <p className="blw-empty-state-hint">Add one to start</p>
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}
