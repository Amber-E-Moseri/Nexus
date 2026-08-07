-- Nova Intelligence Layer — Release 1 Foundation
-- Creates: nova_sessions, nova_messages, nova_audit_log tables
-- Creates: nova_audit_log_admin_query() SECURITY DEFINER function
-- Does NOT modify any existing tables.

-- ── nova_sessions ────────────────────────────────────────────────────────
create table public.nova_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  department_id uuid references public.departments(id),
  space_id uuid,
  session_type text not null default 'chat'
    check (session_type in ('chat', 'daily_brief', 'meeting_prep',
                             'project_analysis', 'report', 'draft')),
  title text,
  status text not null default 'active'
    check (status in ('active', 'completed', 'expired')),
  context jsonb not null default '{}',
  context_version integer not null default 1,
  expires_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nova_sessions_user_id_idx on public.nova_sessions(user_id);
create index nova_sessions_status_idx on public.nova_sessions(status) where status = 'active';

alter table public.nova_sessions enable row level security;

create policy nova_sessions_own on public.nova_sessions
  for all to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.set_nova_sessions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nova_sessions_updated_at
  before update on public.nova_sessions
  for each row execute function public.set_nova_sessions_updated_at();

-- ── nova_messages ────────────────────────────────────────────────────────
create table public.nova_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.nova_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null check (role in ('user', 'assistant')),
  content text,
  sources jsonb default '[]',
  intent text,
  created_at timestamptz not null default now()
);

create index nova_messages_session_id_idx on public.nova_messages(session_id);
create index nova_messages_created_at_idx on public.nova_messages(created_at);

alter table public.nova_messages enable row level security;

create policy nova_messages_own on public.nova_messages
  for all to authenticated
  using (
    session_id in (select id from public.nova_sessions where user_id = (select auth.uid()))
  );

-- ── nova_audit_log ───────────────────────────────────────────────────────
create table public.nova_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  session_id uuid references public.nova_sessions(id),
  intent text not null,
  tools_invoked text[] default '{}',
  source_ids jsonb default '[]',
  model_used text,
  tokens_used integer,
  latency_ms integer,
  proposal_id uuid,
  is_action boolean not null default false,
  confirmed_at timestamptz,
  actor_confirmed boolean default false,
  safety_event text,
  created_at timestamptz not null default now()
);

create index nova_audit_log_user_id_idx on public.nova_audit_log(user_id);
create index nova_audit_log_created_at_idx on public.nova_audit_log(created_at);
create index nova_audit_log_is_action_idx on public.nova_audit_log(is_action) where is_action = true;

alter table public.nova_audit_log enable row level security;

create policy nova_audit_own on public.nova_audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy nova_audit_insert on public.nova_audit_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── Admin query function ─────────────────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS (the base table only has an own-row
-- policy). Gates on role inside the body. Excludes source_ids from the
-- return type so admins see operational metadata only, not cited source
-- record IDs. search_path pinned per Postgres SECURITY DEFINER guidance.
create or replace function public.nova_audit_log_admin_query(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, session_id uuid,
  intent text, tools_invoked text[],
  model_used text, tokens_used integer, latency_ms integer,
  is_action boolean, confirmed_at timestamptz, actor_confirmed boolean,
  safety_event text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select current_user_role()) not in ('super_admin', 'regional_secretary') then
    raise exception 'permission denied';
  end if;

  return query
    select
      al.id, al.user_id, al.session_id,
      al.intent, al.tools_invoked,
      al.model_used, al.tokens_used, al.latency_ms,
      al.is_action, al.confirmed_at, al.actor_confirmed,
      al.safety_event, al.created_at
    from public.nova_audit_log al
    order by al.created_at desc
    limit p_limit offset p_offset;
end;
$$;

grant execute on function public.nova_audit_log_admin_query(integer, integer) to authenticated;
