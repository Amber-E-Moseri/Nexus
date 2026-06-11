create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_id uuid not null references public.tasks(id) on delete cascade,
  type text not null default 'blocking'
    check (type in ('blocking', 'waiting_on')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null,
  url text not null,
  drive_file_id text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.task_dependencies enable row level security;
alter table public.task_files enable row level security;
alter table public.task_comments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_dependencies'
      and policyname = 'task_dependencies_select'
  ) then
    create policy "task_dependencies_select"
    on public.task_dependencies
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.tasks
        where tasks.id = task_dependencies.task_id
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_dependencies'
      and policyname = 'task_dependencies_write'
  ) then
    create policy "task_dependencies_write"
    on public.task_dependencies
    for all
    to authenticated
    using (created_by = auth.uid() or public.current_user_role() = 'super_admin')
    with check (created_by = auth.uid() or public.current_user_role() = 'super_admin');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_files'
      and policyname = 'task_files_select'
  ) then
    create policy "task_files_select"
    on public.task_files
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.tasks
        where tasks.id = task_files.task_id
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_files'
      and policyname = 'task_files_write'
  ) then
    create policy "task_files_write"
    on public.task_files
    for all
    to authenticated
    using (uploaded_by = auth.uid() or public.current_user_role() = 'super_admin')
    with check (uploaded_by = auth.uid() or public.current_user_role() = 'super_admin');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_comments'
      and policyname = 'task_comments_select'
  ) then
    create policy "task_comments_select"
    on public.task_comments
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.tasks
        where tasks.id = task_comments.task_id
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_comments'
      and policyname = 'task_comments_write'
  ) then
    create policy "task_comments_write"
    on public.task_comments
    for all
    to authenticated
    using (author_id = auth.uid() or public.current_user_role() = 'super_admin')
    with check (author_id = auth.uid() or public.current_user_role() = 'super_admin');
  end if;
end $$;

create index if not exists task_dependencies_task_id_idx on public.task_dependencies(task_id);
create index if not exists task_dependencies_depends_on_idx on public.task_dependencies(depends_on_id);
create index if not exists task_files_task_id_idx on public.task_files(task_id);
create index if not exists task_comments_task_id_idx on public.task_comments(task_id);
