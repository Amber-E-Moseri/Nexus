-- Ensures sprint_members.role uses the current vocabulary
-- (owner / manager / contributor / viewer). Earlier installs may still carry
-- the legacy ('lead','member') constraint, which makes createSprint() — that
-- inserts role 'owner' — fail with sprint_members_role_check violations.

-- Drop the constraint first so legacy rows can be migrated without tripping it.
alter table public.sprint_members
  drop constraint if exists sprint_members_role_check;

-- Migrate any legacy role values left over from older schemas.
update public.sprint_members
set role = case
  when role = 'lead' then 'owner'
  when role = 'member' then 'contributor'
  else role
end
where role in ('lead', 'member');

-- The original schema defaulted role to 'member', which is no longer a valid
-- value — an insert that omits role would violate the new constraint. Point the
-- default at a valid, least-privilege-ish role instead.
alter table public.sprint_members
  alter column role set default 'contributor';

-- Re-add the constraint with the current allowed set.
alter table public.sprint_members
  add constraint sprint_members_role_check
  check (role in ('owner', 'manager', 'contributor', 'viewer'));
