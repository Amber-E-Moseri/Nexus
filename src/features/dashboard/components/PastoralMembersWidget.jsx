import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { getPastoralMembers } from '../lib/dashboard-queries'

function AttendanceIndicator({ percent }) {
  let color = '#2D8653'
  let label = 'Good'
  if (percent < 70) {
    color = '#C94830'
    label = 'Alert'
  } else if (percent < 85) {
    color = '#C47E0A'
    label = 'Fair'
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 16,
        fontWeight: 800,
        color: color,
        lineHeight: 1,
      }}>
        {percent}%
      </div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: color,
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: '.05em',
      }}>
        {label}
      </div>
    </div>
  )
}

export default function PastoralMembersWidget() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    let active = true
    getPastoralMembers(profile.id)
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
  }, [profile?.id])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No members assigned</div>
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
          background: 'white',
          transition: 'background 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAF7'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
        >
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {member.name.split(' ').map(n => n[0]).join('')}
          </div>
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
            <div style={{
              fontSize: 11,
              color: '#9E9488',
              marginTop: 2,
            }}>
              {member.last_meeting_date ? new Date(member.last_meeting_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : 'No meetings'}
            </div>
          </div>
          <AttendanceIndicator percent={member.attendance_percent} />
        </div>
      ))}
    </div>
  )
}
