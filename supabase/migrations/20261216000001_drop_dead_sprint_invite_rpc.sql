-- Drop the add_sprint_member_profile RPC that was the alternate sprint-invite
-- path. It had two independent bugs (auth.uid() is null in the service-role
-- context it was called from; it provisioned status='pending_activation'
-- which nothing ever flipped to active) and is no longer wired to any UI.
-- The live path is the add-sprint-member edge function instead.
drop function if exists public.add_sprint_member_profile(uuid, text, text, uuid, text, date);
