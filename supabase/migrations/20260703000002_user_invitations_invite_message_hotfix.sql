-- Hotfix for environments where the auth onboarding migration did not add invite_message.

alter table public.user_invitations
  add column if not exists invite_message text;
