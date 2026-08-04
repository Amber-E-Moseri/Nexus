-- Audit trail and lightweight rate-limit source for the remote MCP connector.
-- API keys remain in public.api_keys: each key is already hashed, revocable,
-- scoped to a department or sprint, and attributed to created_by.

create table if not exists public.mcp_tool_audit_log (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  tool_name text not null,
  success boolean not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists mcp_tool_audit_log_key_created_idx
  on public.mcp_tool_audit_log(api_key_id, created_at desc);

alter table public.mcp_tool_audit_log enable row level security;

drop policy if exists "mcp_tool_audit_log_admin_select" on public.mcp_tool_audit_log;
create policy "mcp_tool_audit_log_admin_select"
  on public.mcp_tool_audit_log
  for select to authenticated
  using (public.current_user_role() = 'super_admin');

comment on table public.mcp_tool_audit_log is
  'Server-written audit log for Claude Cowork MCP tool calls. Used for support investigation and a per-key rolling rate limit.';
