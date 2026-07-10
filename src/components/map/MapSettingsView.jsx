import { useState, useEffect } from 'react'
import { STATUS, STATUS_ORDER } from './data/status'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

const statusOptions = STATUS_ORDER

export function MapSettingsView({ campuses, onClose }) {
  const { showToast } = useToast()
  const [statusChanges, setStatusChanges] = useState({})
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState({})

  useEffect(() => {
    // Build stats: count by status
    const counts = {}
    statusOptions.forEach((s) => {
      counts[s] = campuses.filter(
        (c) => c.lat && c.lng && c.status === s
      ).length
    })
    setStats(counts)
  }, [campuses])

  const handleStatusChange = (campusId, newStatus) => {
    setStatusChanges((prev) => ({
      ...prev,
      [campusId]: newStatus,
    }))
  }

  const handleBulkStatusChange = (statusFilter, newStatus) => {
    const changes = {}
    campuses.forEach((c) => {
      if (c.status === statusFilter && c.lat && c.lng) {
        changes[c.id] = newStatus
      }
    })
    setStatusChanges((prev) => ({
      ...prev,
      ...changes,
    }))
    showToast(`Marked ${Object.keys(changes).length} campus/campuses for status change`, 'info')
  }

  const handleSaveChanges = async () => {
    if (Object.keys(statusChanges).length === 0) {
      showToast('No changes to save', 'info')
      return
    }

    setSaving(true)
    try {
      const updates = Object.entries(statusChanges).map(([campusId, newStatus]) => ({
        id: campusId,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }))

      // Update all campuses in batch
      for (const update of updates) {
        const { error } = await supabase
          .from('campuses')
          .update({ status: update.status, updated_at: update.updated_at })
          .eq('id', update.id)

        if (error) throw error
      }

      showToast(`Updated ${updates.length} campus/campuses`, 'success')
      setStatusChanges({})
    } catch (error) {
      showToast(`Error saving changes: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Group campuses by status
  const campusesByStatus = {}
  statusOptions.forEach((s) => {
    campusesByStatus[s] = campuses.filter((c) => c.lat && c.lng && c.status === s).sort((a, b) => a.institution.localeCompare(b.institution))
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #e8eaed',
          flexShrink: 0,
        }}
      >
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 17, color: '#202124', fontWeight: 700 }}>
          ⚙️ Map Settings
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#80868b',
            fontSize: 20,
            padding: '4px 8px',
            borderRadius: 6,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
          }}
        >
          <div style={{ maxWidth: 1200 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#202124', marginBottom: 12 }}>Bulk Status Updates</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {statusOptions.map((status) => (
                  <div
                    key={status}
                    style={{
                      padding: 12,
                      border: '1px solid #e8eaed',
                      borderRadius: 8,
                      background: '#f8f9fa',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#202124' }}>
                        {status}
                      </span>
                      <span style={{ fontSize: 11, color: '#9aa0a6', background: '#e8eaed', padding: '2px 6px', borderRadius: 4 }}>
                        {stats[status] || 0}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {statusOptions.map((target) => (
                        target !== status && (
                          <button
                            key={target}
                            onClick={() => handleBulkStatusChange(status, target)}
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid #e8eaed',
                              background: '#fff',
                              color: '#202124',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#e8eaed'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#fff'
                            }}
                          >
                            → {target.replace(' Fellowship', '')}
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(statusChanges).length > 0 && (
              <div
                style={{
                  padding: 16,
                  background: '#fef7e0',
                  border: '1px solid #f9ab00',
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9a8000', marginBottom: 8 }}>
                  {Object.keys(statusChanges).length} campus/campuses pending changes
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSaveChanges}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#f9ab00',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setStatusChanges({})}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid #e8eaed',
                      background: '#fff',
                      color: '#202124',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#202124', marginBottom: 12, marginTop: 24 }}>
              Campus Status List
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {statusOptions.map((status) => (
                <div
                  key={status}
                  style={{
                    border: '1px solid #e8eaed',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      background: STATUS[status].color + '14',
                      borderBottom: '1px solid #e8eaed',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: STATUS[status].color }}>
                      {status} ({campusesByStatus[status].length})
                    </div>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {campusesByStatus[status].length > 0 ? (
                      campusesByStatus[status].map((campus) => (
                        <div
                          key={campus.id}
                          style={{
                            padding: 10,
                            borderBottom: '1px solid #f0f0f0',
                            fontSize: 11,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: '#202124' }}>{campus.institution}</div>
                            <div style={{ color: '#9aa0a6', fontSize: 10 }}>{campus.campus}</div>
                          </div>
                          {statusChanges[campus.id] ? (
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#f9ab00' }}>
                              → {statusChanges[campus.id].replace(' Fellowship', '')}
                            </div>
                          ) : (
                            <select
                              value={status}
                              onChange={(e) => handleStatusChange(campus.id, e.target.value)}
                              style={{
                                fontSize: 10,
                                padding: '4px 6px',
                                borderRadius: 4,
                                border: '1px solid #e8eaed',
                                background: '#fff',
                                cursor: 'pointer',
                              }}
                            >
                              {statusOptions.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          padding: 12,
                          textAlign: 'center',
                          color: '#9aa0a6',
                          fontSize: 11,
                        }}
                      >
                        No campuses
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
