-- Allow super_admin to update flight data in registrations table
-- GUARD: registrations managed by external Apps Script sync
do $$
begin
  if not exists (select 1 from pg_class where relname = 'registrations' and relnamespace = 'public'::regnamespace) then
    raise notice 'Skipping: registrations not yet created';
    return;
  end if;
  if not exists (select 1 from pg_policies where policyname = 'super_admin_update_flights' and tablename = 'registrations') then
    execute $pol$create policy "super_admin_update_flights" on registrations
    for update
    to authenticated
    using (current_user_role() = 'super_admin'::text)
    with check (current_user_role() = 'super_admin'::text)$pol$;
  end if;
end $$;
