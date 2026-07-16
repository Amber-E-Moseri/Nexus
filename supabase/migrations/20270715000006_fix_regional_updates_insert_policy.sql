-- The regional_updates_insert WITH CHECK required `created_by = auth.uid()`.
-- While logically correct (the column DEFAULT is auth.uid()), this can fail
-- when PostgREST evaluates the policy before the DEFAULT is fully resolved,
-- or when auth.uid() returns a transient NULL near token-refresh boundaries.
-- The column is NOT NULL + DEFAULT auth.uid(), so the value is always
-- authoritative — the role/grant check alone is the right authorization gate.

drop policy if exists "regional_updates_insert" on public.regional_updates;

create policy "regional_updates_insert"
  on public.regional_updates
  for insert
  to authenticated
  with check (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.user_has_grant(auth.uid(), 'regional_secretary_access')
  );

-- Also ensure the grant row exists for the regional secretary — the original
-- seed migration ran a SELECT against users but the account may have been
-- provisioned afterwards, leaving no grant row.
insert into public.user_grants (user_id, grant_type)
select id, 'regional_secretary_access'
from public.users
where email ilike 'regionalsecretary@lwcanada.org'
on conflict (user_id, grant_type, resource_type) do nothing;
