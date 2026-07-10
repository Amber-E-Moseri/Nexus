-- Add the Flock Calls Due dashboard widget to role presets.
-- Pastors get it first (daily call queue is their primary driver); adds an
-- explicit regional_secretary case (previously fell through to the default).

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
        'my_tasks_summary',
        'upcoming_events',
        'upcoming_meetings',
        'sprint_progress',
        'quick_actions'
      );
    when 'dept_lead' then
      v_widgets := json_build_array(
        'my_tasks_summary',
        'overdue_by_member',
        'sprint_progress',
        'team_workload',
        'completion_rate',
        'team_activity_heatmap',
        'team_velocity',
        'quick_actions'
      );
    when 'pastor' then
      v_widgets := json_build_array(
        'flock_calls_due',
        'my_tasks_summary',
        'pastoral_members',
        'attendance_summary',
        'absent_members_alert',
        'upcoming_meetings',
        'quick_actions'
      );
    when 'regional_secretary' then
      v_widgets := json_build_array(
        'flock_calls_due',
        'my_tasks_summary',
        'upcoming_events',
        'upcoming_meetings',
        'quick_actions'
      );
    when 'super_admin' then
      v_widgets := json_build_array(
        'my_tasks_summary',
        'flock_calls_due',
        'overdue_by_member',
        'sprint_progress',
        'team_workload',
        'completion_rate',
        'team_activity_heatmap',
        'team_velocity',
        'pastoral_members',
        'attendance_summary',
        'absent_members_alert',
        'upcoming_events',
        'upcoming_meetings',
        'activity_feed',
        'quick_actions'
      );
    else
      v_widgets := json_build_array(
        'my_tasks_summary',
        'upcoming_events',
        'upcoming_meetings',
        'quick_actions'
      );
  end case;

  return v_widgets;
end;
$$;

grant execute on function public.get_dashboard_presets(text) to authenticated;
