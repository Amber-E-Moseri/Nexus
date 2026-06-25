import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'

export default function FlockCRMDashboardWidget() {
  const [stats, setStats] = useState({ today: 0, overdue: 0, week: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${FLOCK_CRM_CONFIG.apiUrl}?action=quickStats`)
      if (!response.ok) throw new Error('API error')

      const data = await response.json()
      setStats({
        today: data.today || 0,
        overdue: data.callbacks || 0,
        week: data.week || 0,
        total: data.total || 0
      })
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Flock stats error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#C94830' }}>
        <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600 }}>Flock CRM Unavailable</p>
        <button
          onClick={fetchStats}
          style={{
            background: '#4C2A92',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <StatCard label="Due Today" value={stats.today} color="#4C2A92" loading={loading} />
        <StatCard label="Overdue" value={stats.overdue} color="#C94830" loading={loading} />
        <StatCard label="This Week" value={stats.week} color="#2D8653" loading={loading} />
        <StatCard label="Total Tracked" value={stats.total} color="#7A6F5E" loading={loading} />
      </div>

      <div style={{ fontSize: '11px', color: '#9E9488', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          {lastUpdated ? `Last updated ${formatTime(lastUpdated)}` : 'Loading...'}
        </span>
        <button
          onClick={fetchStats}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            color: loading ? '#D1CBC0' : '#9E9488',
            padding: '2px 6px',
            fontSize: '12px',
            transition: 'color 0.2s',
          }}
          title="Refresh"
        >
          <RefreshCw size={12} style={{ transform: loading ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, loading }) {
  return (
    <div
      style={{
        background: '#FAFAF7',
        border: '1px solid #EDE8DC',
        borderRadius: '12px',
        padding: '14px 8px',
        textAlign: 'center',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color
        e.currentTarget.style.background = '#FFFFFF'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#EDE8DC'
        e.currentTarget.style.background = '#FAFAF7'
      }}
    >
      <div style={{
        fontSize: '32px',
        fontWeight: '900',
        color: color,
        lineHeight: '1',
        opacity: loading ? 0.5 : 1,
      }}>
        {loading ? '—' : value}
      </div>
      <div style={{
        fontSize: '10px',
        fontWeight: '700',
        color: '#9E9488',
        marginTop: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </div>
    </div>
  )
}

function formatTime(date) {
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return 'today'
}
