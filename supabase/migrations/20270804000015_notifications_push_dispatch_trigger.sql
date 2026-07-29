-- ============================================================
-- Push dispatch trigger on notifications INSERT
--
-- Previously, mobile push was only dispatched by 2 edge functions
-- (due-date-reminders, calendar-event-reminders). Task assignments,
-- @mentions, comments, status changes, sprint events etc. all
-- inserted into `notifications` but never called send-task-push-notification.
--
-- This trigger fires after every INSERT on `notifications` and calls
-- the edge function via pg_net (fire-and-forget). Exceptions are
-- swallowed so a push failure never blocks notification storage.
--
-- The edge function is updated to accept {userId, notificationType,
-- payload} and format the title/message itself.
-- ============================================================

create or replace function public.dispatch_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
begin
  if v_url is null or v_key is null then
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-task-push-notification',
    body    := jsonb_build_object(
      'userId',           NEW.user_id,
      'notificationType', NEW.type,
      'payload',          coalesce(NEW.payload, '{}'::jsonb)
    ),
    headers := jsonb_build_object(
      'apikey',        v_key,
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    )
  );

  return NEW;
exception when others then
  -- Push dispatch must never block notification storage
  return NEW;
end;
$$;

drop trigger if exists dispatch_push_on_notification_insert on public.notifications;
create trigger dispatch_push_on_notification_insert
  after insert on public.notifications
  for each row execute function public.dispatch_push_on_notification_insert();
