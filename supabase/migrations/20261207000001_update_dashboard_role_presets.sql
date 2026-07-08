-- Update role-based dashboard presets to include new widgets
-- (goals, embed, personal_reminders, team_availability, action_items)

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
        'my_tasks_summary',
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
        'my_tasks_summary',
        'upcoming_meetings',
        'upcoming_events',
        'action_items',
        'personal_reminders',
        'my_spaces',
        'team_availability'
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

-- Seed new widgets to dashboard_role_defaults for reset path
-- Append to existing role entries without overwriting
insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('member',              'goals',                true, 3),
  ('member',              'personal_reminders',   true, 7),
  ('member',              'team_availability',    true, 8),
  ('dept_lead',           'goals',                true, 2),
  ('dept_lead',           'member_activity',      true, 6),
  ('dept_lead',           'team_availability',    true, 9),
  ('pastor',              'personal_reminders',   true, 4),
  ('pastor',              'team_availability',    true, 7),
  ('super_admin',         'goals',                true, 2),
  ('super_admin',         'regional_updates',     true, 1)
on conflict (role, widget_key) do nothing;
