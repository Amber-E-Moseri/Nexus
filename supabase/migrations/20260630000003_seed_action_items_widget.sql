-- =============================================================================
-- Show "My Action Items" widget by default
-- -----------------------------------------------------------------------------
-- The widget was registered in the UI but never appeared by default because it
-- was absent from BOTH default sources:
--   * get_dashboard_presets(role)  — used on a user's first load (no saved
--     prefs). This is the primary driver and is a hardcoded CASE, NOT the
--     dashboard_role_defaults table.
--   * dashboard_role_defaults      — used by the "Reset to defaults" action.
-- We seed both. Users who have already customised their dashboard keep their
-- saved layout (the loader short-circuits when saved prefs exist), so this only
-- affects users who never customised.
-- =============================================================================

-- 1. Primary path: first-load presets per role -------------------------------
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
        'upcoming_events',
        'upcoming_meetings',
        'sprint_progress',
        'quick_actions'
      );
    when 'dept_lead' then
      v_widgets := json_build_array(
        'my_tasks_summary',
        'action_items',
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
        'my_tasks_summary',
        'action_items',
        'pastoral_members',
        'attendance_summary',
        'absent_members_alert',
        'upcoming_meetings',
        'quick_actions'
      );
    when 'super_admin' then
      v_widgets := json_build_array(
        'my_tasks_summary',
        'action_items',
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
      -- Covers regional_secretary and any other role.
      v_widgets := json_build_array(
        'my_tasks_summary',
        'action_items',
        'upcoming_events',
        'upcoming_meetings',
        'quick_actions'
      );
  end case;

  return v_widgets;
end;
$$;

grant execute on function public.get_dashboard_presets(text) to authenticated;

-- 2. Reset path: dashboard_role_defaults table -------------------------------
insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('member',              'action_items', true, 2),
  ('dept_lead',           'action_items', true, 2),
  ('pastor',              'action_items', true, 2),
  ('regional_secretary',  'action_items', true, 2),
  ('super_admin',         'action_items', true, 2)
on conflict (role, widget_key) do nothing;
