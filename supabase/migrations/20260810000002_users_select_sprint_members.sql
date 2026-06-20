-- Allow any authenticated user to read the profile of users who share a sprint
-- with them. Without this, getSprintMembers() returns only the current user
-- because RLS on public.users blocks reads of other users' rows.

create policy "users_select_sprint_coworkers"
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.sprint_members sm1
    join public.sprint_members sm2 on sm1.sprint_id = sm2.sprint_id
    where sm1.user_id = auth.uid()
      and sm2.user_id = users.id
  )
);
