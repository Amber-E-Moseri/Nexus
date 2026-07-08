import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { getTeamAvailability } from '../lib/dashboard-queries'

export default function TeamAvailabilityWidget() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.department_id) {
      setLoading(false)
      return
    }

    let active = true
    getTeamAvailability(profile.department_id)
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
  }, [profile?.department_id])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>Everyone's available</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map(member => (
        <div key={member.member_id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: '#F5F4F1',
        }}
        >
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#9E9488',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#2D2A22',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {member.name}
            </div>
            <div style={{ fontSize: 11, color: '#9E9488', marginTop: 2 }}>
              {member.reason || 'Away'}
              {member.until ? ` · back ${new Date(member.until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
