-- ============================================================
-- MINISTRY CALENDAR — Harden approve/reject RPCs
-- ============================================================
-- approve_calendar_event / reject_calendar_event are SECURITY DEFINER
-- functions, which run with elevated privilege and bypass RLS entirely.
-- They previously had no authorization check of their own, so any
-- authenticated (or even anonymous, depending on EXECUTE grants) caller
-- could approve/reject any event by calling the RPC directly. They also
-- had no idempotency guard, so two managers actioning the same pending
-- event would silently race — the second call always won with no
-- indication a conflict occurred.
--
-- This adds the same authorization check already used by the
-- calendar_events_update_managers RLS policy, plus a
-- `where status = 'pending'` guard that raises if the event was already
-- actioned.

create or replace function public.approve_calendar_event(
  event_id uuid
)
returns void
language plpgsql security definer
as $$
begin
  if not (
    auth.jwt() ->> 'user_role' = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where user_id = auth.uid() and can_manage = true
    )
  ) then
    raise exception 'not authorized to approve calendar events';
  end if;

  update public.calendar_events
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = event_id
    and status = 'pending';

  if not found then
    raise exception 'event % is not pending approval (already actioned or does not exist)', event_id;
  end if;
end;
$$;

create or replace function public.reject_calendar_event(
  event_id uuid,
  note text
)
returns void
language plpgsql security definer
as $$
begin
  if not (
    auth.jwt() ->> 'user_role' = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where user_id = auth.uid() and can_manage = true
    )
  ) then
    raise exception 'not authorized to reject calendar events';
  end if;

  update public.calendar_events
  set status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now(),
      rejection_note = note
  where id = event_id
    and status = 'pending';

  if not found then
    raise exception 'event % is not pending approval (already actioned or does not exist)', event_id;
  end if;
end;
$$;
