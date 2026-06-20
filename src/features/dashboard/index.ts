export { default as ActivityFeedWidget } from './components/ActivityFeedWidget'
export { default as AttendanceSummaryWidget } from './components/AttendanceSummaryWidget'
export { default as CompletionRateWidget } from './components/CompletionRateWidget'
export { default as MemberActivityWidget } from './components/MemberActivityWidget'
export { default as OrgReportExport } from './components/OrgReportExport'
export { default as OverdueByMemberWidget } from './components/OverdueByMemberWidget'
export { default as SprintProgressWidget } from './components/SprintProgressWidget'
export { default as UpcomingEventsWidget } from './components/UpcomingEventsWidget'
export { default as UpcomingMeetingsWidget } from './components/UpcomingMeetingsWidget'

export {
  getDashboardStats,
  getActivityFeedItems,
  getAttendanceTrends,
  getCompletionRate,
  getMemberActivity,
  getOverdueTasks,
  getSprintProgress,
  generateOrgReport,
} from './lib/dashboards'
