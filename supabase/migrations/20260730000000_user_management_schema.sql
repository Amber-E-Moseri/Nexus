-- User Management Schema: Deactivation & Avatar Storage

-- 1. Add deactivation columns to users table
alter table public.users
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.users(id) on delete set null;

-- 2. Create avatars storage bucket
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', false)
  on conflict (id) do nothing;

-- 3. Create is_active_user() function for RLS
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select deactivated_at is null
  from public.users
  where id = auth.uid();
$$;

-- 4. RLS Policies for avatar storage
-- Users can upload their own avatars
create policy "users_can_upload_own_avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own avatars
create policy "users_can_delete_own_avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Avatars are publicly readable
create policy "avatars_are_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

-- 5. Update users table RLS to prevent deactivated users from accessing data
-- Note: This relies on existing RLS policies that check is_active_user()
-- Add this check to any policies that select from users table
-- Example: existing policies should add "and is_active_user()" condition

-- 6. Indexes for deactivation queries
create index if not exists idx_users_deactivated_at on public.users(deactivated_at) where deactivated_at is not null;
create index if not exists idx_users_deactivated_by on public.users(deactivated_by);
