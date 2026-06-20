import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

export default function AttendanceSummaryWidget({ role, userId, departmentId }) {
  const [data, setData] = useState({
    rate30: null,
    rate60: null,
    topMembers: [],
    bottomMembers: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Visible to super_admin and dept_lead only
    if (role !== 'super_admin' && role !== 'dept_lead') {
      setLoading(false)
      return
    }

    let active = true

    async function load() {
      setLoading(true)
      try {
        const [data30, data60] = await Promise.all([
          supabase.rpc('get_department_attendance_summary', {
            p_department_id: role === 'dept_lead' ? departmentId : null,
            p_days_back: 30,
          }),
          supabase.rpc('get_department_attendance_summary', {
            p_department_id: role === 'dept_lead' ? departmentId : null,
            p_days_back: 60,
          }),
        ])

        if (!active) return

        const rate30 = data30.data?.[0]?.overall_rate_pct ?? null
        const rate60 = data60.data?.[0]?.overall_rate_pct ?? null

        // Get top 3 and bottom 3 members from the 30-day data (already sorted by rate desc)
        const memberData = data30.data ?? []
        const topMembers = memberData.slice(0, 3)
        const bottomMembers = memberData.slice(-3).reverse()

        if (active) {
          setData({
            rate30,
            rate60,
            topMembers,
            bottomMembers,
          })
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [role, userId, departmentId])

  // Hide for member and pastor roles
  if (role !== 'super_admin' && role !== 'dept_lead') {
    return null
  }

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>

  const { rate30, rate60, topMembers, bottomMembers } = data

  if (rate30 === null) {
    return <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No attendance data available</div>
  }

  const trend = rate60 !== null ? rate30 - rate60 : 0
  const trendArrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '—'
  const trendColor = trend > 0 ? '#2D8653' : trend < 0 ? '#C94830' : '#9E9488'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#4C2A92', lineHeight: 1 }}>
          {rate30}%
        </span>
        {rate60 !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
            {trendArrow} {Math.abs(trend).toFixed(1)}% vs 60d
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: '#9E9488', marginBottom: 16 }}>
        Avg attendance — last 30 days
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2D2A22', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Top performers
        </div>
        {topMembers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topMembers.map((member) => (
              <div key={member.member_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#6B6560' }}>
                <span>{member.member_name}</span>
                <span style={{ fontWeight: 700, color: '#2D8653' }}>{member.member_rate_pct}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#9E9488' }}>No data</div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2D2A22', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Needs attention
        </div>
        {bottomMembers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bottomMembers.map((member) => (
              <div key={member.member_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#6B6560' }}>
                <span>{member.member_name}</span>
                <span style={{ fontWeight: 700, color: '#C94830' }}>{member.member_rate_pct}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#9E9488' }}>No data</div>
        )}
      </div>

      <NavLink to="/meetings/attendance-trends" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        View full trends →
      </NavLink>
    </div>
  )
}
