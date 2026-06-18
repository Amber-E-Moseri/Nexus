import { useEffect, useState } from 'react'
import { Copy, Trash2, Settings, Plus } from 'lucide-react'
import { getICalSubscriptions, deleteICalSubscription, generateICalToken } from '../../lib/calendar'
import { useToast } from '../../context/ToastContext'

export default function CalendarSettingsPanel({ userId, departments = [] }) {
  const { showToast } = useToast()
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newSub, setNewSub] = useState({ scope: 'all', department_id: null })
  const [copiedId, setCopiedId] = useState(null)

  async function loadSubscriptions() {
    setLoading(true)
    try {
      const data = await getICalSubscriptions(userId)
      setSubscriptions(data || [])
    } catch (err) {
      console.error('Failed to load subscriptions:', err)
      showToast('Failed to load subscriptions', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  }, [userId])

  async function handleGenerateToken() {
    if (!userId) return
    if (newSub.scope === 'department' && !newSub.department_id) {
      showToast('Please select a department', { tone: 'error' })
      return
    }

    setGenerating(true)
    try {
      const result = await generateICalToken(userId, newSub.scope, newSub.department_id)
      showToast('iCal token generated successfully', { tone: 'success' })
      setShowNewForm(false)
      setNewSub({ scope: 'all', department_id: null })
      await loadSubscriptions()
    } catch (err) {
      console.error('Failed to generate token:', err)
      showToast('Failed to generate token', { tone: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  async function handleDeleteSubscription(id) {
    if (!window.confirm('Delete this subscription?')) return

    try {
      await deleteICalSubscription(id)
      showToast('Subscription deleted', { tone: 'success' })
      setSubscriptions(subscriptions.filter((s) => s.id !== id))
    } catch (err) {
      console.error('Failed to delete subscription:', err)
      showToast('Failed to delete subscription', { tone: 'error' })
    }
  }

  function copyToClipboard(token) {
    const url = `${window.location.origin}/calendar-ical?token=${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(token)
      showToast('iCal URL copied to clipboard', { tone: 'success' })
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {
      showToast('Failed to copy URL', { tone: 'error' })
    })
  }

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
        Loading settings...
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
        <Settings size={18} style={{ color: 'var(--accent)' }} />
        <h3 style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          flex: 1
        }}>
          Calendar Settings
        </h3>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '0 0 12px'
          }}>
            iCal Feed Subscriptions
          </h4>
          <p style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            margin: 0,
            marginBottom: '12px'
          }}>
            Generate tokens to subscribe to your calendar in external apps like Google Calendar, Outlook, or Apple Calendar.
          </p>

          {subscriptions.length === 0 ? (
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: 'var(--surface-tertiary)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '12px'
            }}>
              No subscriptions yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {subscriptions.map((sub) => (
                <div key={sub.id} style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '12px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textTransform: 'capitalize',
                      marginBottom: '2px'
                    }}>
                      {sub.scope === 'all' ? 'Org-wide Events' : `${departments.find(d => d.id === sub.department_id)?.name || 'Department'}`}
                    </div>
                    <div style={{
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      Created {new Date(sub.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(sub.token)}
                    title="Copy iCal URL"
                    style={{
                      padding: '6px',
                      backgroundColor: copiedId === sub.token ? 'var(--accent)' : 'white',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: copiedId === sub.token ? 'white' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteSubscription(sub.id)}
                    title="Delete subscription"
                    style={{
                      padding: '6px',
                      backgroundColor: 'white',
                      border: '1px solid #f44336',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f44336',
                      flexShrink: 0
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Plus size={16} />
            New Subscription
          </button>
        ) : (
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface-tertiary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-primary)'
              }}>
                Scope
              </label>
              <select
                value={newSub.scope}
                onChange={(e) => setNewSub({ ...newSub, scope: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                <option value="all">Org-wide Events</option>
                <option value="department">Department Only</option>
              </select>
            </div>

            {newSub.scope === 'department' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-primary)'
                }}>
                  Department
                </label>
                <select
                  value={newSub.department_id || ''}
                  onChange={(e) => setNewSub({ ...newSub, department_id: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select a department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowNewForm(false)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '12px',
                  color: 'var(--text-primary)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateToken}
                disabled={generating}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '12px',
                  opacity: generating ? 0.6 : 1
                }}
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
