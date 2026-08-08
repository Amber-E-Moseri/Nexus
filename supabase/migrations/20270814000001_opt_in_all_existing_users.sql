-- Opt in all existing users by default
UPDATE public.users
SET opted_out = FALSE
WHERE opted_out IS NULL OR opted_out = TRUE;
