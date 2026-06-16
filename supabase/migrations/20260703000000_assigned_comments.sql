alter table public.task_comments
  add column if not exists assigned_to uuid references public.users(id),
  add column if not exists assigned_at timestamptz,
  add column if not exists resolved_by uuid references public.users(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists mentions uuid[] not null default '{}'::uuid[];

create index if not exists task_comments_assigned_to_idx
  on public.task_comments (assigned_to)
  where assigned_to is not null;

create index if not exists task_comments_unresolved_assigned_idx
  on public.task_comments (resolved_at)
  where resolved_at is null
    and assigned_to is not null;

create index if not exists task_comments_mentions_gin_idx
  on public.task_comments
  using gin (mentions);

create table if not exists public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null
    check (action in (
      'task_assigned', 'task_status_changed', 'task_due_changed',
      'task_created', 'comment_added', 'comment_assigned',
      'sprint_updated', 'dependency_added'
    )),
  entity_type text not null
    check (entity_type in ('task', 'comment', 'sprint')),
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists activity_feed_user_read_created_idx
  on public.activity_feed (user_id, read, created_at desc);

create index if not exists activity_feed_user_created_idx
  on public.activity_feed (user_id, created_at desc);

create index if not exists activity_feed_entity_idx
  on public.activity_feed (entity_id);

alter table public.activity_feed enable row level security;

drop policy if exists "activity_feed_select_own" on public.activity_feed;
drop policy if exists "activity_feed_insert_authenticated" on public.activity_feed;
drop policy if exists "activity_feed_update_own" on public.activity_feed;
drop policy if exists "activity_feed_delete_own" on public.activity_feed;

create policy "activity_feed_select_own"
on public.activity_feed
for select
to authenticated
using (user_id = auth.uid());

create policy "activity_feed_insert_authenticated"
on public.activity_feed
for insert
to authenticated
with check (true);

create policy "activity_feed_update_own"
on public.activity_feed
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "activity_feed_delete_own"
on public.activity_feed
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "task_comments_resolve_assigned" on public.task_comments;

create policy "task_comments_resolve_assigned"
on public.task_comments
for update
to authenticated
using (
  assigned_to = auth.uid()
  or author_id = auth.uid()
  or exists (
    select 1
    from public.tasks
    where id = task_comments.task_id
      and (
        assignee_id = auth.uid()
        or created_by = auth.uid()
      )
  )
)
with check (
  assigned_to = auth.uid()
  or author_id = auth.uid()
  or exists (
    select 1
    from public.tasks
    where id = task_comments.task_id
      and (
        assignee_id = auth.uid()
        or created_by = auth.uid()
      )
  )
);
