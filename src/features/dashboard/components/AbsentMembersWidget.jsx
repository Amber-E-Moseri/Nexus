import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../hooks/useAuth'
import { getAbsentMembers } from '../lib/dashboard-queries'

export default function AbsentMembersWidget() {
  const { profile } = useAuth()

  // Shared query cache (BLW-05)
  const { data: members = [], isPending: loading } = useQuery({
    queryKey: ['absent-members', profile?.department_id, 7],
    enabled: Boolean(profile?.department_id),
    queryFn: () => getAbsentMembers(profile.department_id, 7).then((data) => data ?? []),
  })

  if (!profile?.department_id) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>All members present</div>
  )
  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>All members present</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map(member => (
        <div key={member.member_id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          border: '1px solid #FEE3DE',
          borderRadius: 8,
          background: '#FEF0ED',
          transition: 'background 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#FEE3DE'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#FEF0ED'}
        >
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#C94830',
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
            <div style={{
              fontSize: 11,
              color: '#9E9488',
              marginTop: 2,
            }}>
              Missed {member.meetings_missed} meeting{member.meetings_missed !== 1 ? 's' : ''}
            </div>
          </div>
          <button style={{
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#C94830',
            background: 'white',
            border: '1px solid #FEE3DE',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#C94830'
            e.currentTarget.style.color = 'white'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.color = '#C94830'
          }}
          >
            Alert
          </button>
        </div>
      ))}
    </div>
  )
}
