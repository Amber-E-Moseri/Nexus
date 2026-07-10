-- Fix: category add/delete silently failed for super admins.
--
-- Root cause: calendar_permissions ended up with BOTH a text `permission`
-- column and a boolean `can_manage` column. The super-admin grant migration
-- (20261219000001) set permission = 'can_manage' but left the boolean
-- can_manage at its default of false. The RLS policy on calendar_event_types
-- gates management on `can_manage = true`, so the grant never took effect —
-- INSERT/DELETE were silently filtered to zero rows (no error surfaced).
--
-- Fix in two parts:
--   1. Backfill can_manage = true for every existing 'can_manage' grant.
--   2. Rewrite the manage policy so super admins are authorized by JWT role
--      directly, independent of the calendar_permissions boolean mismatch.

-- 1. Backfill the boolean flag from the text permission grants.
update public.calendar_permissions
set can_manage = true
where permission = 'can_manage'
  and can_manage is distinct from true;

-- 2. Harden the manage policy on calendar_event_types.
drop policy if exists "Manage event types" on public.calendar_event_types;

create policy "Manage event types"
  on public.calendar_event_types
  for all
  to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where calendar_permissions.user_id = auth.uid()
        and calendar_permissions.can_manage = true
    )
  )
  with check (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where calendar_permissions.user_id = auth.uid()
        and calendar_permissions.can_manage = true
    )
  );
