import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { OverviewTab } from './tabs/OverviewTab'
import { PrayerRequestsTab } from './tabs/PrayerRequestsTab'
import { PrayerActivityTab } from './tabs/PrayerActivityTab'
import CampusEditForm from './CampusEditForm'
import { useCanEditCampus } from '../../hooks/useCanEditCampus'
import { useToast } from '../../context/ToastContext'

const TAB_ICONS = {
  overview: '📊',
  requests: '🙏',
  activity: '📈',
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
  { id: 'requests', label: 'Prayer Requests', icon: TAB_ICONS.requests },
  { id: 'activity', label: 'Prayer Activity', icon: TAB_ICONS.activity },
]

export function CampusDetailModal({ campus, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [stats, setStats] = useState({
    totalPrayers: 0,
    activeRequests: 0,
    thisWeek: 0,
  })
  const [prayerRequests, setPrayerRequests] = useState([])
  const [prayerLogs, setPrayerLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const canEdit = useCanEditCampus()
  const { showToast } = useToast()

  // Load campus data
  useEffect(() => {
    if (!isOpen || !campus?.id) return

    setLoading(true)
    const fetchData = async () => {
      try {
        // Prayer logs (activity)
        const { data: logs } = await supabase
          .from('prayer_logs')
          .select('id, duration_seconds, logged_at, user_id')
          .eq('campus_id', campus.id)
          .order('logged_at', { ascending: false })
          .limit(50)

        // Prayer requests
        const { data: requests } = await supabase
          .from('prayer_requests')
          .select('id, title, description, created_at, resolved_at, user_id')
          .eq('campus_id', campus.id)
          .order('created_at', { ascending: false })

        setPrayerLogs(logs || [])
        setPrayerRequests(requests || [])

        // Calculate stats
        const activeReqs = (requests || []).filter((r) => !r.resolved_at).length
        const thisWeekLogs = (logs || []).filter((l) => {
          const days = (Date.now() - new Date(l.logged_at)) / (1000 * 60 * 60 * 24)
          return days <= 7
        }).length

        setStats({
          totalPrayers: logs?.length || 0,
          activeRequests: activeReqs,
          thisWeek: thisWeekLogs,
        })
      } catch (err) {
        console.error('Error loading campus data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Subscribe to real-time updates
    const logsSubscription = supabase
      .channel(`prayer-logs-${campus.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prayer_logs', filter: `campus_id=eq.${campus.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPrayerLogs((prev) => [payload.new, ...prev])
            setStats((s) => ({ ...s, totalPrayers: s.totalPrayers + 1 }))
          } else if (payload.eventType === 'DELETE') {
            setPrayerLogs((prev) => prev.filter((l) => l.id !== payload.old.id))
            setStats((s) => ({ ...s, totalPrayers: Math.max(0, s.totalPrayers - 1) }))
          }
        }
      )
      .subscribe()

    const requestsSubscription = supabase
      .channel(`prayer-requests-${campus.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prayer_requests', filter: `campus_id=eq.${campus.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPrayerRequests((prev) => [payload.new, ...prev])
            setStats((s) => ({ ...s, activeRequests: s.activeRequests + 1 }))
          } else if (payload.eventType === 'UPDATE') {
            const wasActive = !payload.old.resolved_at
            const isActive = !payload.new.resolved_at
            setPrayerRequests((prev) =>
              prev.map((r) => (r.id === payload.new.id ? payload.new : r))
            )
            if (wasActive && !isActive) {
              setStats((s) => ({ ...s, activeRequests: Math.max(0, s.activeRequests - 1) }))
            } else if (!wasActive && isActive) {
              setStats((s) => ({ ...s, activeRequests: s.activeRequests + 1 }))
            }
          } else if (payload.eventType === 'DELETE') {
            const wasActive = !payload.old.resolved_at
            setPrayerRequests((prev) => prev.filter((r) => r.id !== payload.old.id))
            if (wasActive) {
              setStats((s) => ({ ...s, activeRequests: Math.max(0, s.activeRequests - 1) }))
            }
          }
        }
      )
      .subscribe()

    return () => {
      logsSubscription.unsubscribe()
      requestsSubscription.unsubscribe()
    }
  }, [isOpen, campus?.id])

  if (!isOpen || !campus) return null

  return (
    <div className="blw-modal-overlay" onClick={onClose}>
      <div className="blw-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="blw-modal-header">
          <div className="blw-modal-header-content">
            <h2 className="blw-modal-title">
              {isEditing ? 'Edit Campus' : campus.name || campus.institution}
            </h2>
            {!isEditing && (
              <>
                {campus.institution && campus.name !== campus.institution && (
                  <p className="blw-modal-subtitle">{campus.institution}</p>
                )}
                {campus.hub && <p className="blw-modal-hub">📍 {campus.hub}</p>}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
              >
                ✏️ Edit
              </button>
            )}
            <button
              className="blw-modal-close"
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false)
                } else {
                  onClose()
                }
              }}
              aria-label={isEditing ? 'Cancel edit' : 'Close modal'}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Tabs - only show when not editing */}
        {!isEditing && (
          <div className="blw-modal-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`blw-modal-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-selected={activeTab === tab.id}
              >
                <span className="blw-modal-tab-icon">{tab.icon}</span>
                <span className="blw-modal-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="blw-modal-body">
          {isEditing ? (
            <CampusEditForm
              campus={campus}
              onSave={() => {
                setIsEditing(false)
                showToast('Edit submitted for review', { tone: 'success' })
              }}
              onCancel={() => setIsEditing(false)}
              isLoading={false}
            />
          ) : (
            <>
              {loading && <div className="blw-modal-loading">Loading...</div>}

              {!loading && activeTab === 'overview' && (
                <OverviewTab stats={stats} campus={campus} />
              )}

              {!loading && activeTab === 'requests' && (
                <PrayerRequestsTab campusId={campus.id} requests={prayerRequests} onRequestsChange={setPrayerRequests} />
              )}

              {!loading && activeTab === 'activity' && (
                <PrayerActivityTab logs={prayerLogs} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
