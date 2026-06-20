import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { getTeamActivityHeatmap } from '../lib/dashboard-queries'

function HeatmapCell({ count, maxCount }) {
  const intensity = maxCount > 0 ? count / maxCount : 0
  const color = `rgba(45, 134, 83, ${0.2 + intensity * 0.8})`

  return (
    <div style={{
      width: '100%',
      height: '24px',
      background: color,
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 600,
      color: intensity > 0.5 ? 'white' : '#9E9488',
      cursor: 'pointer',
      transition: 'all 0.15s',
    }}
    title={`${count} action${count !== 1 ? 's' : ''}`}
    >
      {count > 0 ? count : '—'}
    </div>
  )
}

export default function TeamActivityHeatmap() {
  const { profile } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.department_id) {
      setLoading(false)
      return
    }

    let active = true
    getTeamActivityHeatmap(profile.department_id)
      .then(data => {
        if (active) setData(data ?? [])
      })
      .catch(() => {
        if (active) setData([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [profile?.department_id])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (data.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No activity data</div>
  )

  const grouped = {}
  for (const entry of data) {
    if (!grouped[entry.name]) grouped[entry.name] = {}
    grouped[entry.name][entry.day_offset] = entry.activity_count
  }

  const members = Object.keys(grouped).sort()
  const days = [0, 1, 2, 3, 4, 5, 6]
  const maxCount = Math.max(...data.map(e => e.activity_count), 1)

  return (
    <div style={{ overflow: 'x-auto', fontSize: 11 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {members.map(member => (
          <div key={member} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 100, minWidth: 100, fontSize: 12, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 1 }}>
              {days.map(day => (
                <HeatmapCell
                  key={day}
                  count={grouped[member]?.[day] ?? 0}
                  maxCount={maxCount}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 10, color: '#9E9488', textAlign: 'center' }}>
        Last 7 days (light = low activity, dark = high activity)
      </div>
    </div>
  )
}
