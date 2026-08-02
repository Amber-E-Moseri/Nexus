-- Allow super_admin to update flight data in registrations table
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'super_admin_update_flights' and tablename = 'registrations') then
    create policy "super_admin_update_flights" on registrations
    for update
    to authenticated
    using (current_user_role() = 'super_admin'::text)
    with check (current_user_role() = 'super_admin'::text);
  end if;
end $$;
