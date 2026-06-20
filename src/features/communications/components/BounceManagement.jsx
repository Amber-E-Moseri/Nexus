import { useState, useEffect } from 'react'
import { Search, Download, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import { getBounceMetrics, getSuppressionList, unsuppressEmail, unsuppressAll } from '..'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'
const BORDER = '#EDE8DC'
const SUCCESS = '#2D6A4F'
const ERROR = '#C94830'
const WARNING = '#9A6000'

export default function BounceManagement({ supabase, isMobile = false }) {
  const [metrics, setMetrics] = useState({
    total_bounced: 0,
    hard_bounces: 0,
    soft_bounces: 0,
    suppressed_count: 0,
  })
  const [suppressionList, setSuppressionList] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [unsuppressingAll, setUnsuppressingAll] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [metricsData, listData] = await Promise.all([
        getBounceMetrics(supabase),
        getSuppressionList(supabase, '', 100, 0),
      ])
      setMetrics(metricsData)
      setSuppressionList(listData)
    } catch (err) {
      console.error('Failed to load bounce data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (value) => {
    setSearch(value)
    if (value.trim()) {
      setLoadingList(true)
      try {
        const data = await getSuppressionList(supabase, value, 100, 0)
        setSuppressionList(data)
      } finally {
        setLoadingList(false)
      }
    } else {
      setLoadingList(true)
      try {
        const data = await getSuppressionList(supabase, '', 100, 0)
        setSuppressionList(data)
      } finally {
        setLoadingList(false)
      }
    }
  }

  const handleUnsuppress = async (email) => {
    try {
      const result = await unsuppressEmail(supabase, email)
      if (result.success) {
        setSuppressionList(suppressionList.filter(s => s.email !== email))
        setMetrics(prev => ({ ...prev, suppressed_count: Math.max(0, prev.suppressed_count - 1) }))
      }
    } catch (err) {
      console.error('Failed to unsuppress email:', err)
    }
  }

  const handleUnsuppressAll = async () => {
    if (!window.confirm('Unsuppress all bounced emails? This cannot be undone.')) return

    setUnsuppressingAll(true)
    try {
      const result = await unsuppressAll(supabase)
      if (result.success) {
        setSuppressionList([])
        setMetrics(prev => ({ ...prev, suppressed_count: 0 }))
      }
    } finally {
      setUnsuppressingAll(false)
    }
  }

  const handleExportCSV = () => {
    const csv = [
      ['Email', 'Bounce Type', 'Bounced At'],
      ...suppressionList.map(s => [
        s.email,
        s.bounce_type,
        new Date(s.bounced_at).toLocaleString(),
      ]),
    ]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suppression-list-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>
        Loading bounce metrics...
      </div>
    )
  }

  const hardBounceRate = metrics.total_bounced > 0
    ? ((metrics.hard_bounces / metrics.total_bounced) * 100).toFixed(1)
    : 0

  return (
    <div>
      {/* Metrics cards */}
      <div style={{
        display: isMobile ? 'block' : 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        <MetricCard
          label="Total Bounced"
          value={metrics.total_bounced}
          subtext={`${metrics.hard_bounces} hard, ${metrics.soft_bounces} soft`}
          color={ERROR}
        />
        <MetricCard
          label="Hard Bounces"
          value={metrics.hard_bounces}
          subtext={`${hardBounceRate}% of all bounces`}
          color={ERROR}
        />
        <MetricCard
          label="Soft Bounces"
          value={metrics.soft_bounces}
          subtext="Temporary (will retry)"
          color={WARNING}
        />
        <MetricCard
          label="Suppressed"
          value={metrics.suppressed_count}
          subtext="Excluded from sends"
          color={PRIMARY}
        />
      </div>

      {/* Suppression list */}
      <div style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: 16,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>
              Suppression List
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: MUTED }}>
              {suppressionList.length} suppressed emails
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleExportCSV}
              disabled={suppressionList.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: suppressionList.length > 0 ? ACCENT : BORDER,
                color: suppressionList.length > 0 ? '#fff' : MUTED,
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: suppressionList.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 150ms',
              }}
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              onClick={handleUnsuppressAll}
              disabled={suppressionList.length === 0 || unsuppressingAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: suppressionList.length > 0 ? SUCCESS : BORDER,
                color: suppressionList.length > 0 ? '#fff' : MUTED,
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: suppressionList.length > 0 ? 'pointer' : 'not-allowed',
                opacity: unsuppressingAll ? 0.6 : 1,
                transition: 'all 150ms',
              }}
            >
              <RotateCcw size={14} />
              Unsuppress All
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: MUTED,
            }} />
            <input
              type="email"
              placeholder="Search suppressed emails..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 12,
                color: TEXT,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* List */}
        {loadingList ? (
          <div style={{ textAlign: 'center', padding: 20, color: MUTED, fontSize: 12 }}>
            Searching...
          </div>
        ) : suppressionList.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 700, color: TEXT }}>Bounced At</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 700, color: TEXT }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {suppressionList.map((item, idx) => (
                  <tr key={idx} style={{
                    borderBottom: `1px solid ${BORDER}`,
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = BG }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '10px 0', color: TEXT }}>{item.email}</td>
                    <td style={{
                      padding: '10px 0',
                      color: item.bounce_type === 'hard' ? ERROR : WARNING,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                    }}>
                      {item.bounce_type}
                    </td>
                    <td style={{ padding: '10px 0', color: MUTED }}>
                      {new Date(item.bounced_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 0', textAlign: 'right' }}>
                      <button
                        onClick={() => handleUnsuppress(item.email)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 8px',
                          background: 'transparent',
                          border: `1px solid ${SUCCESS}`,
                          color: SUCCESS,
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 150ms',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = SUCCESS
                          e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = SUCCESS
                        }}
                      >
                        <RotateCcw size={11} />
                        Unsuppress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: MUTED,
            background: BG,
            borderRadius: 6,
          }}>
            No suppressed emails
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, subtext, color }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: MUTED }}>
        {subtext}
      </div>
    </div>
  )
}
