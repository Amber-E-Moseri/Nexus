-- Rate limiting tracking table for API abuse prevention
-- Tracks requests per IP and per email to prevent enumeration attacks

create table if not exists public.rate_limits (
  id              uuid        primary key default gen_random_uuid(),
  ip_address      text        not null,
  email           text,
  endpoint        text        not null default 'rsvp'
                              check (endpoint in ('rsvp', 'unsubscribe', 'track_click')),
  attempt_count   integer     not null default 1,
  window_start    timestamptz not null default now(),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Composite index for efficient lookups (only if columns exist)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'rate_limits' and column_name = 'ip_address'
  ) then
    execute 'create index if not exists idx_rate_limits_ip_endpoint_window on public.rate_limits(ip_address, endpoint, window_start)';
  end if;
end $$;

-- Index for email-based rate limiting
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'rate_limits' and column_name = 'email'
  ) then
    execute 'create index if not exists idx_rate_limits_email_endpoint_window on public.rate_limits(email, endpoint, window_start) where email is not null';
  end if;
end $$;

-- Index for cleanup of expired records
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'rate_limits' and column_name = 'expires_at'
  ) then
    execute 'create index if not exists idx_rate_limits_expires_at on public.rate_limits(expires_at) where expires_at < now()';
  end if;
end $$;

-- Table for logging rate limit violations (for alerting)
create table if not exists public.rate_limit_violations (
  id              uuid        primary key default gen_random_uuid(),
  ip_address      text        not null,
  email           text,
  endpoint        text        not null,
  limit_type      text        not null
                              check (limit_type in ('ip_per_minute', 'email_per_hour')),
  current_count   integer     not null,
  limit_value     integer     not null,
  created_at      timestamptz not null default now()
);

-- Index for recent violations
create index if not exists idx_rate_limit_violations_ip_created
  on public.rate_limit_violations(ip_address, created_at);

-- Comments only if table doesn't already exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'rate_limits' and table_schema = 'public') then
    execute 'comment on table public.rate_limits is ''Tracks request counts per IP/email for rate limiting (auto-expires after 1 hour)''';
    execute 'comment on column public.rate_limits.ip_address is ''Client IP address (extracted from X-Forwarded-For or request origin)''';
    execute 'comment on column public.rate_limits.email is ''Email address being accessed (for email-based rate limiting)''';
    execute 'comment on column public.rate_limits.endpoint is ''Which endpoint is being rate-limited''';
    execute 'comment on column public.rate_limits.window_start is ''Start of the current rate limit window (1 minute or 1 hour depending on limit)''';
    execute 'comment on column public.rate_limits.expires_at is ''When this rate limit entry expires and can be deleted''';
  end if;
end $$;

comment on table public.rate_limit_violations is
  'Logs when rate limits are exceeded; used for alerting and abuse detection';
