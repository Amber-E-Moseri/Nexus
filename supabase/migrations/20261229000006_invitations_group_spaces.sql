-- Add group_space_ids to user_invitations table
-- Allows admins to pre-assign group spaces when inviting someone

ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS group_space_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- When an invitation is accepted and a user is created, add them to group spaces
-- This is handled in the create_user_from_invitation RPC function

CREATE INDEX IF NOT EXISTS user_invitations_group_space_ids_idx
  ON public.user_invitations USING GIN (group_space_ids);
