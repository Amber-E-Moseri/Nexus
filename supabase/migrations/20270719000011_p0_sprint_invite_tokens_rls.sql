-- P0: sprint_invite_tokens had RLS fully disabled, making the entire table
-- writable (INSERT/UPDATE/DELETE) by any unauthenticated client.
-- Enable RLS and add an explicit SELECT policy for anon + authenticated so
-- token validation from invite URLs still works, while default-deny blocks
-- all writes from the client. Service_role (edge functions) bypasses RLS for writes.

alter table public.sprint_invite_tokens enable row level security;

create policy "sprint_invite_tokens_select"
  on public.sprint_invite_tokens
  for select
  to anon, authenticated
  using (true);
