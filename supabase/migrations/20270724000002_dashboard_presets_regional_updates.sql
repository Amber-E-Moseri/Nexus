-- =============================================================================
-- Add Regional Updates widget to default dashboard presets
-- -----------------------------------------------------------------------------
-- get_dashboard_presets(p_role) only included 'regional_updates' in the
-- super_admin branch. member/dept_lead/pastor omitted it entirely, and there
-- was no 'regional_secretary' case at all (fell through to the generic
-- 4-widget else) — so even the Regional Secretary who posts updates never
-- saw the widget on their own dashboard by default. Adds 'regional_updates'
-- to the front of member/dept_lead/pastor's widget lists and adds a
-- regional_secretary case, modeled on dept_lead's list per product decision.
--
-- Also updates dashboard_role_defaults (the "reset dashboard to default"
-- seed table from 20261207000001_update_dashboard_role_presets.sql) to stay
-- in sync with this function.
-- =============================================================================

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

insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('member',              'regional_updates', true, 1),
  ('dept_lead',           'regional_updates', true, 1),
  ('pastor',              'regional_updates', true, 1),
  ('regional_secretary',  'regional_updates', true, 1),
  ('regional_secretary',  'my_tasks_summary', true, 2),
  ('regional_secretary',  'goals',            true, 3),
  ('regional_secretary',  'sprint_progress',  true, 4),
  ('regional_secretary',  'team_workload',    true, 5),
  ('regional_secretary',  'overdue_by_member',true, 6),
  ('regional_secretary',  'member_activity',  true, 7),
  ('regional_secretary',  'completion_rate',  true, 8),
  ('regional_secretary',  'upcoming_meetings',true, 9),
  ('regional_secretary',  'team_availability',true, 10),
  ('regional_secretary',  'quick_actions',    true, 11)
on conflict (role, widget_key) do nothing;
