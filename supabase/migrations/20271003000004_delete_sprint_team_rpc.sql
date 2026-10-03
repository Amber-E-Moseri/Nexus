-- =============================================================================
-- delete_sprint_team: SECURITY DEFINER wrapper for safe team deletion
-- -----------------------------------------------------------------------------
-- Postgres ON DELETE CASCADE fires inside the same transaction as the parent
-- DELETE, but AFTER the parent row is already removed from the table. RLS
-- policies on cascade targets that subquery the parent (sprint_team_members
-- write policy) or restrict by granter (file_attachment_access delete policy)
-- silently block the cascade, leaving orphaned rows and rolling back the whole
-- delete without surfacing an error to the client.
--
-- This SECURITY DEFINER function performs an explicit permission check then
-- manually removes child rows before deleting the parent, bypassing the
-- cascade entirely.
-- =============================================================================

create or replace function public.delete_sprint_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint_id uuid;
begin
  select sprint_id into v_sprint_id
  from public.sprint_teams
  where id = p_team_id;

  if v_sprint_id is null then
    return; -- already deleted; treat as no-op
  end if;

  -- Verify the caller has permission to manage this sprint
  if not (
    public.current_user_role() = 'super_admin'
    or public.can_manage_sprint(v_sprint_id)
  ) then
    raise exception 'Permission denied: you cannot delete teams in this sprint';
  end if;

  -- file_attachment_access: delete policy = granted_by = caller; cascade would
  -- be silently blocked for rows granted by other users.
  delete from public.file_attachment_access where sprint_team_id = p_team_id;

  -- sprint_team_members: delete policy subqueries sprint_teams; during cascade
  -- the parent row is already gone, causing the policy to fail.
  delete from public.sprint_team_members where team_id = p_team_id;

  -- Safe to delete the parent now that all children are gone
  delete from public.sprint_teams where id = p_team_id;
end;
$$;

grant execute on function public.delete_sprint_team(uuid) to authenticated;
