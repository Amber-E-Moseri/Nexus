-- Make preview_user_invitation callable without requiring email confirmation
-- This function should be accessible to anyone with a valid token

grant execute on function public.preview_user_invitation(text) to anon, authenticated;

-- Also ensure accept_user_invitation is executable by authenticated users
grant execute on function public.accept_user_invitation(text) to authenticated;
