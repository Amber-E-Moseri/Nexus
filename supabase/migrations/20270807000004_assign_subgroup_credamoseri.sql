-- Assign Central Subgroup A to credamoseri@icloud.com
insert into public.pastor_subgroup_assignments (user_id, subgroup, status)
select id, 'Central Subgroup A', 'active'
from public.users
where email = 'credamoseri@icloud.com'
on conflict (user_id, subgroup) do update set status = 'active';
