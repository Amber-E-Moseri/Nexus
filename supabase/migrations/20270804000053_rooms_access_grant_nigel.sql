-- Fix two issues with user_grants:
--
-- 1. RLS only allowed super_admin to SELECT, so non-admin users could never
--    read their own grants — making finance_data_access grants (and now
--    rooms_access grants) silently no-op for anyone not a super_admin.
--    Add a policy so every authenticated user can see their own rows.
--
-- 2. Replace the "if name includes 'nigel'" hack in RegistrationEcosystem.jsx
--    with a proper rooms_access grant row.

-- Allow users to read their own grants (admins keep their existing full-table policy)
create policy "user_grants_select_own" on public.user_grants
  for select to authenticated
  using (user_id = auth.uid());

-- Grant rooms access to Pastor Nigel via proper grant row
insert into public.user_grants (user_id, grant_type)
select id, 'rooms_access'
from public.users
where name ilike '%nigel%'
on conflict (user_id, grant_type, resource_type) do nothing;
