-- Track historical host name changes for accurate sync mapping
create table if not exists host_name_history (
  id uuid primary key default gen_random_uuid(),
  church_unit_id text not null,
  old_host_name text not null,
  new_host_name text not null,
  changed_at timestamp with time zone not null default now(),
  notes text,
  created_at timestamp with time zone not null default now()
);

-- Index for fast lookup by old name
create index if not exists idx_host_name_history_old_name on host_name_history(old_host_name);
create index if not exists idx_host_name_history_unit_id on host_name_history(church_unit_id);

-- Enable RLS
alter table host_name_history enable row level security;

-- Policy: admins only
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'host_name_history'
      and policyname = 'host_name_history_admin_access'
  ) then
    execute $p$
      create policy "host_name_history_admin_access" on host_name_history
        for all using (
          auth.jwt() ->> 'user_role' = 'super_admin' or
          auth.jwt() ->> 'user_role' = 'admin'
        )
    $p$;
  end if;
end $$;

comment on table host_name_history is 'Maps historical host names to current church_unit_id for sync accuracy when center names change';
