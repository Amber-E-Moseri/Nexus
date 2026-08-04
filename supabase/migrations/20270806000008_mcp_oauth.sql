create table if not exists public.mcp_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  client_id text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_tokens_hash_idx on public.mcp_oauth_tokens(token_hash);
alter table public.mcp_oauth_authorization_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
