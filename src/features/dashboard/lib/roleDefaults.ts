// Role-based default dashboard layouts
// When a new user logs in or resets their dashboard, these defaults are applied
// based on their role. Order matters — affects sort_order in dashboard_preferences.

export interface RoleDefault {
  role: string
  widgets: string[]
  description: string
}

export const ROLE_DEFAULTS: RoleDefault[] = [
  {
    role: 'super_admin',
    widgets: [
      'regional_updates',
      'my_tasks_summary',
      'goals',
      'sprint_progress',
      'team_workload',
      'team_velocity',
      'completion_rate',
      'activity_feed',
      'upcoming_events',
      'absent_members_alert',
    ],
    description: 'Org-wide visibility: all teams, sprints, velocity, and system activity',
  },
  {
    role: 'dept_lead',
    widgets: [
      'my_tasks_summary',
      'goals',
      'sprint_progress',
      'team_workload',
      'overdue_by_member',
      'member_activity',
      'completion_rate',
      'upcoming_meetings',
      'team_availability',
      'quick_actions',
    ],
    description: 'Department focus: team capacity, sprint health, member engagement',
  },
  {
    role: 'member',
    widgets: [
      'my_tasks_summary',
      'action_items',
      'goals',
      'upcoming_meetings',
      'upcoming_events',
      'my_spaces',
      'personal_reminders',
      'team_availability',
      'quick_actions',
    ],
    description: 'Personal focus: my tasks, action items, calendar, and team presence',
  },
  {
    role: 'pastor',
    widgets: [
      'my_tasks_summary',
      'upcoming_meetings',
      'upcoming_events',
      'action_items',
      'personal_reminders',
      'my_spaces',
      'team_availability',
    ],
    description: 'Ministry focus: meetings, events, personal tasks, team availability',
  },
  {
    role: 'group_member',
    widgets: [
      'my_tasks_summary',
      'action_items',
      'my_spaces',
      'personal_reminders',
      'quick_actions',
    ],
    description: 'Restricted focus: personal tasks and assigned group spaces only — no meetings, sprints, or org widgets',
  },
]

export function getDefaultWidgetsForRole(role: string): string[] {
  const defaults = ROLE_DEFAULTS.find(d => d.role === role)
  if (!defaults) {
    // Fallback to member defaults if role not found
    const memberDefault = ROLE_DEFAULTS.find(d => d.role === 'member')
    return memberDefault?.widgets ?? []
  }
  return defaults.widgets
}
