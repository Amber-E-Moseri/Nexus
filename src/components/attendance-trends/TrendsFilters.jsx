import { MEETING_TYPES, PERIODS, ROLES } from '../../hooks/useAttendanceTrends'

const SELECT_STYLE = {
  border: '1px solid #EDE8DC',
  borderRadius: 9,
  padding: '8px 11px',
  fontSize: 13,
  color: '#2D2A22',
  background: 'white',
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
}

export default function TrendsFilters({ meetingType, onMeetingType, subgroupId, onSubgroup, subgroups, period, onPeriod, role, onRole }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={meetingType} onChange={(e) => onMeetingType(e.target.value)} style={SELECT_STYLE}>
        {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <select value={subgroupId} onChange={(e) => onSubgroup(e.target.value)} style={SELECT_STYLE}>
        <option value="">All subgroups</option>
        {subgroups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <select value={period} onChange={(e) => onPeriod(e.target.value)} style={SELECT_STYLE}>
        {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <select value={role} onChange={(e) => onRole(e.target.value)} style={SELECT_STYLE}>
        <option value="">All roles</option>
        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
  )
}
