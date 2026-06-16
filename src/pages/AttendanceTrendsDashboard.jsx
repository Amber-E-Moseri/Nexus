import { useState } from 'react'
import AbsenceAlerts from '../components/attendance-trends/AbsenceAlerts'
import RoleBarChart from '../components/attendance-trends/RoleBarChart'
import SubgroupRankingTable from '../components/attendance-trends/SubgroupRankingTable'
import TrendLineChart from '../components/attendance-trends/TrendLineChart'
import TrendsFilters from '../components/attendance-trends/TrendsFilters'
import { useAttendanceTrends } from '../hooks/useAttendanceTrends'

function KpiTile({ label, value, bg, bd, circle, labelColor, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: bg, border: `1px solid ${bd}` }}>
      <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: circle }} />
      <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: labelColor }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: valueColor, marginTop: 7, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'white', border: '1px solid #EDE8DC', borderRadius: 14, padding: '18px', boxShadow: '0 1px 4px rgba(28,22,16,.05)' }}>
      {title && <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2D2A22', marginBottom: 14 }}>{title}</div>}
      {children}
    </div>
  )
}

export default function AttendanceTrendsDashboard() {
  const [meetingType, setMeetingType] = useState('sub_group')
  const [subgroupId, setSubgroupId] = useState('')
  const [period, setPeriod] = useState('month')
  const [role, setRole] = useState('')

  const { subgroups, ranking, absences, monthlyTrend, roleBreakdown, lit, loading, error, reload } = useAttendanceTrends({
    meetingType, subgroupId, period, role,
  })

  const selectedSubgroupName = subgroups.find((s) => s.id === subgroupId)?.name
    ?? subgroups.find((s) => s.id === ranking[0]?.subgroup_id)?.name
    ?? 'Top Subgroup'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid #EDE8DC', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#2D2A22' }}>Attendance Trends</h1>
        <p style={{ margin: '4px 0 14px', fontSize: 13, color: '#9E9488' }}>
          Individual, subgroup, and role-level attendance insight — within a single meeting type at a time.
        </p>
        <TrendsFilters
          meetingType={meetingType} onMeetingType={setMeetingType}
          subgroupId={subgroupId} onSubgroup={setSubgroupId}
          subgroups={subgroups}
          period={period} onPeriod={setPeriod}
          role={role} onRole={setRole}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#FBF8F2' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {error && (
            <div style={{ fontSize: 12.5, color: '#C94830', background: '#FEF0ED', border: '1px solid #F5C4B8', borderRadius: 10, padding: '10px 14px' }}>
              {error} <button type="button" onClick={reload} style={{ color: '#4C2A92', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Retry</button>
            </div>
          )}

          {/* Top KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <KpiTile label="Subgroups Tracked" value={loading ? '…' : ranking.length} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
            <KpiTile label="Flagged (2+ Absences)" value={loading ? '…' : absences.length} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
            <KpiTile label="LIT Dropout Rate" value={loading ? '…' : `${lit?.dropoutPct ?? 0}%`} bg="#FFF8EC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#E8A020" valueColor="#7A5A00" />
            <KpiTile label="LIT Active" value={loading ? '…' : `${lit?.activeLit ?? 0}/${lit?.totalLit ?? 0}`} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
          </div>

          {/* Trend line + role bar chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
            <Card title={`Monthly Attendance % — ${selectedSubgroupName} (${new Date().getFullYear()})`}>
              <TrendLineChart data={monthlyTrend} />
            </Card>
            <Card title="Attendance by Leadership Role (most recent meeting)">
              <RoleBarChart data={roleBreakdown} />
            </Card>
          </div>

          {/* Subgroup ranking + absence alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
            <Card title="Subgroup Ranking">
              <SubgroupRankingTable rows={ranking} />
            </Card>
            <Card title="Consecutive Absence Alerts">
              <AbsenceAlerts members={absences} />
            </Card>
          </div>

          {/* LIT dropout detail */}
          {lit && lit.droppedLit > 0 && (
            <Card title={`Leaders in Training — Dropped Off (${lit.droppedLit})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lit.members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F9F7F3', borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600, color: '#2D2A22' }}>{m.name}</span>
                    <span style={{ color: '#9E9488' }}>
                      First: {m.firstAttended ? new Date(m.firstAttended).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {' · '}
                      Last: {m.lastAttended ? new Date(m.lastAttended).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
