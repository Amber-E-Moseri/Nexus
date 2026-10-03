-- Phase 0A: push dispatch by stored notification id, authenticated with the dedicated cron secret.
--
-- BEFORE: dispatch_push_on_notification_insert() POSTed { userId, notificationType, payload } and the
-- Edge Function trusted caller-supplied userId/title/message/url. The public anon key reached it
-- (verified live 2026-10-01), so any holder of the anon key could push arbitrary content to any user.
--
-- AFTER: the trigger sends only { notification_id }. The Edge Function (send-task-push-notification,
-- verify_jwt = false) authenticates the caller from the Authorization header (CRON_SHARED_SECRET),
-- then loads the recipient, type and payload from the stored row and derives title, body and an
-- approved deep link server-side. See supabase/functions/_shared/pushCore.ts.
--
-- Hosted-Supabase config pattern (same as 20271001000004 / 20270724000204): values come from
-- public.app_settings via public.app_setting(), never from current_setting('app.*') GUCs.
--   apikey         : service_role_key  (legacy key; satisfies the Edge gateway)
--   Authorization  : Bearer <recurring_meetings_cron_secret>  (== CRON_SHARED_SECRET Edge secret)
--
-- DEPLOY ORDER (see certification doc): deploy the new function, then apply this migration
-- immediately after. Until both are in place push fails CLOSED (in-app notifications are
-- unaffected; the trigger swallows errors so notification storage never blocks).

create or replace function public.dispatch_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
begin
  if v_url is null or v_apikey is null or v_secret is null then
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-task-push-notification',
    body    := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );

  return NEW;
exception when others then
  -- Push dispatch must never block notification storage
  return NEW;
end;
$$;

-- Trigger functions are never meant to be called directly.
revoke all on function public.dispatch_push_on_notification_insert() from public, anon, authenticated;

-- (trigger dispatch_push_on_notification_insert already exists from 20270804000015 and points at this function)
