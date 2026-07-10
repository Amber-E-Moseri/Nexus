import WinsSheet from '../../wins/components/WinsSheet'

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday, matching Planner weeks
  return d
}

// Dashboard surface for the department's weekly wins/testimonies sheet.
// Always shows the current week; the Planner sidebar hosts the
// week-navigable version.
export default function WeeklyWinsWidget({ departmentId }) {
  return <WinsSheet departmentId={departmentId} weekStart={startOfWeek(new Date())} compact />
}
