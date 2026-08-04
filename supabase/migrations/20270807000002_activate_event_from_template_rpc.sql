-- RPC: activate_event_from_template
-- Atomically deactivates the current active config and activates a clone of a template.
-- FOR UPDATE on the template row serializes concurrent calls; the partial unique index
-- on is_active provides the safety net.

create or replace function public.activate_event_from_template(
  p_template_id  uuid,
  p_event_name   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template  event_configs;
  v_new_id    uuid;
begin
  if current_user_role() <> 'super_admin' then
    raise exception 'Permission denied: super_admin required';
  end if;

  select * into v_template
  from event_configs
  where id = p_template_id
  for update;

  if not found then
    raise exception 'Template not found: %', p_template_id;
  end if;

  -- Every activation locks template first and active second to avoid deadlocks.
  perform id from event_configs where is_active = true for update;

  -- Deactivate the current active config (safe before insert because unique index is partial)
  update event_configs
  set is_active = false
  where is_active = true;

  insert into event_configs (
    event_name,
    sprint_pattern,
    is_active,
    is_template,
    early_cutoff_at,
    early_fee,
    standard_fee,
    local_detection_regex,
    exempt_fellowships,
    tab_config,
    team_permissions,
    sidebar_teams,
    public_token_key,
    cloned_from_id,
    created_by
  )
  values (
    coalesce(nullif(trim(p_event_name), ''), v_template.event_name),
    v_template.sprint_pattern,
    true,
    false,
    v_template.early_cutoff_at,
    v_template.early_fee,
    v_template.standard_fee,
    v_template.local_detection_regex,
    v_template.exempt_fellowships,
    v_template.tab_config,
    v_template.team_permissions,
    v_template.sidebar_teams,
    v_template.public_token_key,
    p_template_id,
    auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.activate_event_from_template(uuid, text) to authenticated;
