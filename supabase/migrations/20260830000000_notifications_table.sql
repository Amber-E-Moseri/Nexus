-- Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  payload jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.notifications enable row level security;

-- Create indexes
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);
create index if not exists idx_notifications_user_read on public.notifications(user_id, read);

-- RLS Policy: Users can read their own notifications
create policy "notifications_select"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

-- RLS Policy: System can insert notifications
create policy "notifications_insert"
on public.notifications
for insert
to authenticated
with check (user_id = auth.uid() or (select auth.jwt() ->> 'user_role') = 'super_admin');

-- RLS Policy: Users can update their own notifications
create policy "notifications_update"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
