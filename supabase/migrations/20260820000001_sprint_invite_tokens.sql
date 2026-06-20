-- Sprint invitation tokens for external users
-- Bypasses Supabase's invite system to avoid Gmail scanner issues

create table public.sprint_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  token text not null unique,
  email text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone default now() + interval '24 hours',
  used_at timestamp with time zone,
  created_by uuid not null references auth.users(id)
);

alter table public.sprint_invite_tokens enable row level security;

create policy "users_can_view_own_invite_tokens"
on public.sprint_invite_tokens for select
to authenticated
using (user_id = auth.uid() or created_by = auth.uid());

create index sprint_invite_tokens_token on public.sprint_invite_tokens(token);
create index sprint_invite_tokens_user_id on public.sprint_invite_tokens(user_id);
create index sprint_invite_tokens_expires_at on public.sprint_invite_tokens(expires_at);
