import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ExternalLink, Phone, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'

const SURFACE = {
  card: {
    background: '#FFFFFF',
    border: '1px solid #E7DECF',
    borderRadius: '18px',
    boxShadow: '0 14px 34px rgba(28, 22, 16, 0.05)',
  },
  text: '#1C1610',
  muted: '#7A6F5E',
}

function shellCardStyle(extra = {}) {
  return { ...SURFACE.card, ...extra }
}

function formatTime(date) {
  if (!date) return 'never'
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes <= 0) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function StatTile({ label, value, tone, note }) {
  const tones = {
    violet: { fg: '#4C2A92', bg: '#F3EEFF' },
    red: { fg: '#C94830', bg: '#FDEEEA' },
    green: { fg: '#2D8653', bg: '#ECF8F1' },
    sand: { fg: '#7A6F5E', bg: '#F5F0E7' },
  }
  const palette = tones[tone] ?? tones.violet

  return (
    <div style={shellCardStyle({ padding: '18px', background: palette.bg, borderColor: 'transparent' })}>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SURFACE.muted }}>
        {label}
      </div>
      <div style={{ marginTop: '8px', fontSize: '40px', lineHeight: 1, fontWeight: 900, color: palette.fg }}>
        {value}
      </div>
      <div style={{ marginTop: '10px', fontSize: '12px', lineHeight: 1.5, color: '#5F5549' }}>
        {note}
      </div>
    </div>
  )
}

function ActionCard({ title, copy, actionLabel, onClick, icon, disabled = false, tone = 'light' }) {
  const dark = tone === 'dark'

  return (
    <div
      style={shellCardStyle({
        padding: '18px',
        background: dark ? 'linear-gradient(135deg, #4C2A92 0%, #6A42B8 100%)' : '#FBF8F2',
        borderColor: dark ? 'transparent' : '#E7DECF',
        color: dark ? '#FFFFFF' : SURFACE.text,
      })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            display: 'grid',
            placeItems: 'center',
            background: dark ? 'rgba(255,255,255,0.16)' : '#FFFFFF',
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 800 }}>{title}</div>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '13px', lineHeight: 1.6, color: dark ? 'rgba(255,255,255,0.84)' : '#5F5549' }}>
        {copy}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          border: 'none',
          borderRadius: '10px',
          padding: '10px 14px',
          background: dark ? '#FFFFFF' : '#4C2A92',
          color: dark ? '#4C2A92' : '#FFFFFF',
          fontSize: '12px',
          fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function EmptyPanel({ title, body }) {
  return (
    <div style={shellCardStyle({ padding: '20px' })}>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: SURFACE.text }}>{title}</h2>
      <p style={{ margin: '10px 0 0', fontSize: '13px', lineHeight: 1.7, color: '#5F5549' }}>{body}</p>
    </div>
  )
}

export default function FlockCRMPage() {
  const { role } = useAuth()
  const [stats, setStats] = useState({ today: 0, overdue: 0, week: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (!FLOCK_CRM_CONFIG.enabled || !FLOCK_CRM_CONFIG.checkAccess(role) || !FLOCK_CRM_CONFIG.apiUrl) return undefined

    let cancelled = false

    async function fetchStats() {
      try {
        setLoading(true)
        const response = await fetch(`${FLOCK_CRM_CONFIG.apiUrl}?action=quickStats`)
        if (!response.ok) throw new Error('Flock API unavailable')
        const data = await response.json()
        if (cancelled) return

        setStats({
          today: Number(data.today ?? 0),
          overdue: Number(data.callbacks ?? 0),
          week: Number(data.week ?? 0),
          total: Number(data.total ?? 0),
        })
        setLastUpdated(new Date())
        setError(null)
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    const timer = setInterval(fetchStats, 60000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [role])

  const queueCards = useMemo(() => {
    const items = []

    if (stats.overdue > 0) {
      items.push({
        title: `${stats.overdue} overdue follow-up${stats.overdue === 1 ? '' : 's'}`,
        body: 'This count is coming directly from the Apps Script Flock data source.',
        tone: 'danger',
      })
    }

    if (stats.today > 0) {
      items.push({
        title: `${stats.today} due today`,
        body: 'Same-day outreach items currently active in Flock.',
        tone: 'neutral',
      })
    }

    if (stats.week > 0) {
      items.push({
        title: `${stats.week} due this week`,
        body: 'Weekly care volume reported by the Apps Script backend.',
        tone: 'success',
      })
    }

    return items
  }, [stats])

  if (!FLOCK_CRM_CONFIG.enabled) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Flock CRM Unavailable</h2>
        <p>Flock CRM is not currently enabled.</p>
      </div>
    )
  }

  if (!FLOCK_CRM_CONFIG.checkAccess(role)) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to access Flock CRM.</p>
      </div>
    )
  }

  const canOpenExternal = Boolean(FLOCK_CRM_CONFIG.appUrl)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100%' }}>
      <section
        style={shellCardStyle({
          padding: '24px',
          background: 'radial-gradient(circle at top left, #F8F2E8 0%, #FBF8F2 40%, #FFFFFF 100%)',
        })}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '999px', background: '#F1E8FF', color: '#4C2A92', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <ShieldCheck size={12} />
              Pastoral Operations
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#4C2A92', display: 'grid', placeItems: 'center', color: '#FFFFFF' }}>
                <Phone size={20} />
              </div>
              <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, color: SURFACE.text }}>Flock CRM</h1>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: '1px solid #D8CEBC',
                borderRadius: '12px',
                padding: '12px 16px',
                background: '#FFFFFF',
                color: SURFACE.text,
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => window.open(FLOCK_CRM_CONFIG.appUrl, '_blank', 'noopener,noreferrer')}
              disabled={!canOpenExternal}
              style={{
                border: '1px solid #D8CEBC',
                borderRadius: '12px',
                padding: '12px 16px',
                background: '#FBF8F2',
                color: SURFACE.text,
                fontSize: '13px',
                fontWeight: 800,
                cursor: canOpenExternal ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: canOpenExternal ? 1 : 0.55,
              }}
            >
              <ExternalLink size={14} />
              Open Full CRM
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <StatTile label="Due Today" value={loading ? '-' : stats.today} tone="violet" note="People who need same-day contact." />
        <StatTile label="Overdue" value={loading ? '-' : stats.overdue} tone="red" note="Callbacks past their target follow-up window." />
        <StatTile label="This Week" value={loading ? '-' : stats.week} tone="green" note="Active ministry load scheduled this week." />
        <StatTile label="Tracked" value={loading ? '-' : stats.total} tone="sand" note="Total records currently under pastoral tracking." />
      </section>

      {error ? (
        <div style={{ ...shellCardStyle({ padding: '16px 18px', background: '#FDEEEA', borderColor: 'transparent' }), color: '#A63D2A', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>Unable to load Flock metrics</div>
            <div style={{ marginTop: '4px', fontSize: '13px' }}>{error}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: SURFACE.muted }}>
          Live metrics updated {lastUpdated ? formatTime(lastUpdated) : 'just now'}.
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: '16px' }}>
        <div style={shellCardStyle({ padding: '20px' })}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: SURFACE.text }}>Priority Queue</h2>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: SURFACE.muted }}>
            This queue is sourced from the Apps Script-backed Flock database, not Supabase.
          </p>

          <div style={{ marginTop: '18px', display: 'grid', gap: '12px' }}>
            {queueCards.length > 0 ? (
              queueCards.map((item) => {
                const toneBg = item.tone === 'danger' ? '#FDEEEA' : item.tone === 'success' ? '#ECF8F1' : '#F3EEFF'
                const toneFg = item.tone === 'danger' ? '#C94830' : item.tone === 'success' ? '#2D8653' : '#4C2A92'
                return (
                  <div key={item.title} style={{ padding: '14px 16px', borderRadius: '14px', background: toneBg }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: toneFg }}>{item.title}</div>
                    <div style={{ marginTop: '5px', fontSize: '12px', lineHeight: 1.6, color: '#5F5549' }}>{item.body}</div>
                  </div>
                )
              })
            ) : (
              <div style={{ fontSize: '13px', color: SURFACE.muted }}>
                {loading ? 'Loading queue...' : 'No active queue items returned by the Apps Script source.'}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <ActionCard
            title="Call Logging"
            copy="Keep call logging inside the native page once the Apps Script backend exposes a write endpoint for save operations."
            actionLabel="Open Full CRM"
            onClick={() => window.open(FLOCK_CRM_CONFIG.appUrl, '_blank', 'noopener,noreferrer')}
            icon={<Phone size={16} color="#FFFFFF" />}
            disabled={!canOpenExternal}
            tone="dark"
          />
          <ActionCard
            title="Data Source"
            copy="The native screen is now aligned to the Apps Script-backed Flock database. Additional native lists need more script actions than quickStats."
            actionLabel="Refresh"
            onClick={() => window.location.reload()}
            icon={<RefreshCw size={16} color="#4C2A92" />}
          />
        </div>
      </section>

      <EmptyPanel
        title="Next Native Surface"
        body="To build the full native CRM, the Apps Script service needs structured read/write actions beyond quickStats, such as roster, follow-up list, contact detail, and save-call endpoints. The React page is now pointed away from Supabase and ready to consume those script actions when they exist."
      />
    </div>
  )
}
