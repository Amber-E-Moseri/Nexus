-- Add secure random token fields to communication_unsubscribes
-- Replaces deterministic token generation with cryptographically random tokens

alter table public.communication_unsubscribes
  add column unsubscribe_token varchar(64),
  add column token_created_at timestamptz,
  add column token_expires_at timestamptz;

-- Unique constraint on token to prevent reuse
create unique index idx_communication_unsubscribes_token
  on public.communication_unsubscribes(unsubscribe_token)
  where unsubscribe_token is not null;

-- Index for token expiration queries
create index idx_communication_unsubscribes_token_expires
  on public.communication_unsubscribes(token_expires_at)
  where token_expires_at is not null;

-- Backfill: Existing rows now have token_expires_at = null (expired)
-- New unsubscribes will generate fresh tokens on first request

comment on column public.communication_unsubscribes.unsubscribe_token is
  'SHA-256 hash of the secure random unsubscribe token (64-char hex string)';

comment on column public.communication_unsubscribes.token_created_at is
  'When the secure token was generated';

comment on column public.communication_unsubscribes.token_expires_at is
  'When the secure token expires (default +30 days from creation)';
