import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../hooks/useAuth'
import { getTeamVelocity } from '../lib/dashboard-queries'

export default function TeamVelocityWidget() {
  const { profile } = useAuth()

  // Shared query cache (BLW-05)
  const { data: sprints = [], isPending: loading } = useQuery({
    queryKey: ['team-velocity', profile?.department_id, 4],
    enabled: Boolean(profile?.department_id),
    queryFn: () => getTeamVelocity(profile.department_id, 4).then((data) => (data ?? []).reverse()),
  })

  if (!profile?.department_id) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No sprint data</div>
  )
  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (sprints.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No sprint data</div>
  )

  const maxHeight = 120
  const targetRate = 85

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: maxHeight, marginBottom: 16 }}>
        {sprints.map((sprint) => {
          const rate = sprint.completion_rate_percent || 0
          // Clamp defensively — a completion rate should never exceed 100%,
          // but nothing here enforces that server-side beyond correct data
          // (see the get_team_velocity fan-out bug this fixed). Without a
          // clamp, a bad rate turns into a bar taller than its container,
          // visually overflowing across the rest of the page.
          const height = (Math.min(rate, 100) / 100) * maxHeight

          return (
            <div key={sprint.sprint_id} style={{ flex: 1, textAlign: 'center' }}>
              <div
                title={sprint.sprint_name}
                style={{
                  height: `${height}px`,
                  background: rate >= targetRate ? '#2D8653' : rate >= 70 ? '#C47E0A' : '#C94830',
                  borderRadius: '4px 4px 0 0',
                  transition: 'all 0.3s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.8 }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = 1 }}
              />
              <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#9E9488', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {sprint.sprint_name.split(' ')[0]}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2D2A22', marginTop: 2 }}>
                {rate}%
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9E9488' }}>
        <div style={{ width: 8, height: 2, background: '#C94830' }} /> Needs work
        <div style={{ width: 8, height: 2, background: '#C47E0A', marginLeft: 12 }} /> Fair
        <div style={{ width: 8, height: 2, background: '#2D8653', marginLeft: 12 }} /> Goal ({targetRate}%+)
      </div>
    </div>
  )
}
