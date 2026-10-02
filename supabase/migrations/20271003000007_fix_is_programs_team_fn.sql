-- Fix is_programs_team(): the old definition checked lower(d.name) = 'programs'
-- but no department has that name. The correct check is the is_programs boolean
-- column (set on the Programs department row) or a 'programs' space_role grant.

create or replace function public.is_programs_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.users u
      join public.departments d on d.id = u.department_id
      where u.id = auth.uid()
        and d.is_programs = true
    )
    or
    public.has_space_role_anywhere(auth.uid(), 'programs')
$$;

comment on function public.is_programs_team() is
  'True when the current user is in the Programs department (is_programs flag) or holds a ''programs'' space role. Used by cross-dept visibility and comms RLS.';
