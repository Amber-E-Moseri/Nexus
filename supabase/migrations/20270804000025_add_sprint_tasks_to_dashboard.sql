-- =============================================================================
-- Add My Sprint Tasks widget to default dashboard presets
-- =============================================================================
-- Users should see their sprint tasks by default when they're part of active
-- sprints. Adds 'my_sprint_tasks' to member, dept_lead, and regional_secretary
-- roles (where sprints are relevant), positioned after my_tasks_summary.

create or replace function public.get_dashboard_presets(p_role text)
returns json
language plpgsql
as $$
declare
  v_widgets json;
begin
  case p_role
    when 'member' then
      v_widgets := json_build_array(
        'regional_updates',
        'my_tasks_summary',
        'my_sprint_tasks',
        'action_items',
        'goals',
        'upcoming_meetings',
        'upcoming_events',
        'my_spaces',
        'personal_reminders',
        'team_availability',
        'quick_actions'
      );
    when 'dept_lead' then
      v_widgets := json_build_array(
        'regional_updates',
        'my_tasks_summary',
        'my_sprint_tasks',
        'goals',
        'sprint_progress',
        'team_workload',
        'overdue_by_member',
        'member_activity',
        'completion_rate',
        'upcoming_meetings',
        'team_availability',
        'quick_actions'
      );
    when 'pastor' then
      v_widgets := json_build_array(
        'regional_updates',
        'my_tasks_summary',
        'upcoming_meetings',
        'upcoming_events',
        'action_items',
        'personal_reminders',
        'my_spaces',
        'team_availability'
      );
    when 'regional_secretary' then
      v_widgets := json_build_array(
        'regional_updates',
        'my_tasks_summary',
        'my_sprint_tasks',
        'goals',
        'sprint_progress',
        'team_workload',
        'overdue_by_member',
        'member_activity',
        'completion_rate',
        'upcoming_meetings',
        'team_availability',
        'quick_actions'
      );
    when 'super_admin' then
      v_widgets := json_build_array(
        'regional_updates',
        'my_tasks_summary',
        'goals',
        'sprint_progress',
        'team_workload',
        'team_velocity',
        'completion_rate',
        'activity_feed',
        'upcoming_events',
        'absent_members_alert'
      );
    else
      v_widgets := json_build_array(
        'my_tasks_summary', 'upcoming_events', 'upcoming_meetings', 'quick_actions'
      );
  end case;

  return v_widgets;
end;
$$;

grant execute on function public.get_dashboard_presets(text) to authenticated;

-- Update dashboard_role_defaults seed table for "Reset to defaults" action
insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('member',              'my_sprint_tasks', true, 3),
  ('dept_lead',           'my_sprint_tasks', true, 3),
  ('regional_secretary',  'my_sprint_tasks', true, 3)
on conflict (role, widget_key) do nothing;
