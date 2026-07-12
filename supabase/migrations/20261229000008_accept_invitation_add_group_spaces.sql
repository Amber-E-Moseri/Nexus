-- Update accept_invitation / create_user_from_invitation to add user to group spaces
-- After creating the user from an invitation, add them to any pre-assigned group spaces

-- Helper function must be created before the trigger that references it
CREATE OR REPLACE FUNCTION public.add_user_to_invitation_group_spaces()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid;
  v_space_id uuid;
begin
  -- Get the user ID from the accepted invitation
  select id into v_user_id
  from public.users
  where email = NEW.email
  limit 1;

  if v_user_id is null then
    return NEW;
  end if;

  -- Add user to all group spaces specified in the invitation
  if NEW.group_space_ids is not null and array_length(NEW.group_space_ids, 1) > 0 then
    foreach v_space_id in array NEW.group_space_ids loop
      insert into public.group_space_members (group_space_id, user_id, role, added_by)
      values (v_space_id, v_user_id, 'member', auth.uid())
      on conflict (group_space_id, user_id) do nothing;
    end loop;
  end if;

  return NEW;
end;
$$;

-- Drop and recreate trigger (IF NOT EXISTS is not valid for CREATE TRIGGER)
DROP TRIGGER IF EXISTS user_invitations_accepted_add_group_spaces ON public.user_invitations;

CREATE TRIGGER user_invitations_accepted_add_group_spaces
  AFTER UPDATE OF status ON public.user_invitations
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status != 'accepted')
  EXECUTE FUNCTION public.add_user_to_invitation_group_spaces();
