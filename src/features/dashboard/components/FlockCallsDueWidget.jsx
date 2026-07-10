import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { callFlockCRM } from '../../../lib/flockSupabase'
import { FLOCK_CRM_CONFIG } from '../../../lib/permissions'
import { supabase } from '../../../lib/supabase'
import FlockNotificationsSection from '../../../components/flock/FlockNotificationsSection'

const PURPLE = '#4C2A92'

function StatChip({ label, value, fg, bg }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: bg, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: fg, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: fg, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function FlockCallsDueWidget({ role }) {
  const hasAccess = FLOCK_CRM_CONFIG.checkAccess(role)
  const [stats, setStats] = useState(null)
  const [due, setDue] = useState([])
  const [loading, setLoading] = useState(hasAccess)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!hasAccess) return undefined
    let active = true
    let debounce = null

    async function load() {
      try {
        const [statsRes, dueRes] = await Promise.all([
          callFlockCRM('quickStats'),
          callFlockCRM('duePeople'),
        ])
        if (!active) return
        setStats(statsRes)
        setDue((dueRes.due || []).slice(0, 5))
        setError(null)
      } catch (e) {
        if (active) setError(e.message || 'Could not load Flock data.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    // Refresh on flock table changes (RLS scopes events to the pastor's own
    // rows). Debounced: a logged call touches contacts + interactions + todos.
    const scheduleReload = () => {
      clearTimeout(debounce)
      debounce = setTimeout(load, 400)
    }

    const channel = supabase
      .channel('flock-calls-due-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flock_contacts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flock_interactions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flock_todos' }, scheduleReload)
      .subscribe()

    // Catch date rollovers / missed events when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      clearTimeout(debounce)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hasAccess])

  if (!hasAccess) {
    return (
      <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>
        Flock CRM is available to pastors and the regional secretary.
      </div>
    )
  }

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (error) return <div style={{ fontSize: 12.5, color: '#C94830' }}>{error}</div>

  const dueCount = (stats?.today || 0) + (stats?.callbacks || 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <StatChip label="Due today" value={stats?.today ?? 0} fg={PURPLE} bg="#F3EEFF" />
        <StatChip label="Overdue" value={stats?.callbacks ?? 0} fg="#C94830" bg="#FDEEEA" />
      </div>

      <FlockNotificationsSection stats={stats} />

      {dueCount === 0 ? (
        <div style={{ fontSize: 13, color: '#9E9488', padding: '10px 0', textAlign: 'center' }}>
          No calls due — all caught up ✓
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {due.map((person) => (
            <NavLink
              key={person.id}
              to="/flock-crm"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: '#FAFAF8', textDecoration: 'none' }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 8, background: '#F3EEFF', color: PURPLE, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Phone size={12} />
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {person.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FDEEEA', color: '#C94830', flexShrink: 0 }}>
                {person.status || 'Due'}
              </span>
            </NavLink>
          ))}
        </div>
      )}

      <NavLink to="/flock-crm" style={{ fontSize: 12, color: PURPLE, fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        Open Flock CRM →
      </NavLink>
    </div>
  )
}
