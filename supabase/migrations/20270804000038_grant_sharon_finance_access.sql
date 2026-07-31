-- Grant Sharon Mutambwi finance data access for TII 2.0 registration
insert into public.user_grants (user_id, grant_type)
select id, 'finance_data_access'
from public.users
where email = 'smutambwi1@gmail.com'
on conflict (user_id, grant_type, resource_type) do nothing;
