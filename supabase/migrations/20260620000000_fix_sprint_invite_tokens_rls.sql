-- Allow unauthenticated users to read sprint invite tokens
-- They need to see tokens from the URL to validate invitations

ALTER TABLE sprint_invite_tokens DISABLE ROW LEVEL SECURITY;
