import { useEffect, useState } from 'react'
import { getTeamWorkload } from '../lib/dashboard-queries'

function UtilizationBar({ percent, name }) {
  let color = '#2D8653'
  if (percent > 100) color = '#C94830'
  else if (percent >= 80) color = '#C47E0A'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ width: 100, minWidth: 100 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          height: 6,
          background: '#EDE8DC',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, percent)}%`,
            background: color,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>
      <div style={{ minWidth: 45, textAlign: 'right' }}>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: color,
          padding: '2px 6px',
          borderRadius: 4,
          background: color === '#2D8653' ? '#EBF7F1' : color === '#C47E0A' ? '#FEF8E7' : '#FEF0ED',
        }}>
          {percent}%
        </span>
      </div>
    </div>
  )
}

export default function TeamWorkloadWidget({ departmentId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!departmentId) {
      setLoading(false)
      return
    }

    let active = true
    getTeamWorkload(departmentId)
      .then(data => {
        if (active) setMembers(data ?? [])
      })
      .catch(() => {
        if (active) setMembers([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [departmentId])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No team members</div>
  )

  return (
    <div>
      {members.map(member => (
        <UtilizationBar
          key={member.user_id}
          name={member.name}
          percent={member.utilization_percent}
        />
      ))}
      <div style={{ fontSize: 10, color: '#9E9488', marginTop: 8, textAlign: 'center' }}>
        Green &lt;80% · Yellow 80-100% · Red &gt;100%
      </div>
    </div>
  )
}
