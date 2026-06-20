import { useState } from 'react'
import { useMeetings } from '../MeetingsContext'
import StatsCards from './StatsCards'
import DepartmentFilter from './DepartmentFilter'
import MeetingsList from './MeetingsList'

export default function LogView({ stats, departments, selectedDept, onDeptChange, canManage, onAddMeeting, onStartLive }) {
  const { meetings } = useMeetings()

  const filteredMeetings = selectedDept === 'all'
    ? meetings
    : meetings.filter((m) => m.department_id === selectedDept)

  return (
    <div style={{ display: 'grid', gap: 18, flex: 1 }}>
      <StatsCards stats={stats} />

      <DepartmentFilter
        departments={departments}
        selected={selectedDept}
        onChange={onDeptChange}
        count={filteredMeetings.length}
      />

      <MeetingsList
        onAddMeeting={onAddMeeting}
        onStartLive={onStartLive}
        canManage={canManage}
      />
    </div>
  )
}
