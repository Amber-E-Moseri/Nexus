-- Phase 0A (email): dispatch notification email by stored notification id, authenticated with the
-- dedicated cron secret.
--
-- BEFORE: dispatch_email_on_notification_insert() POSTed { notification_id, user_id, notification_type,
-- payload } and send-notification-email trusted those fields with NO caller authorization, so the public
-- anon key could make Nexus email arbitrary templated content (and an arbitrary link) to any user.
--
-- AFTER: the trigger sends only { notification_id }. The Edge Function (verify_jwt = false) authenticates
-- the caller from the Authorization header (CRON_SHARED_SECRET), then loads the recipient, type and payload
-- from the stored row and renders the email server-side (see supabase/functions/_shared/emailCore.ts).
--
-- Hosted-Supabase config pattern (same as 20271001000004 / 20271002000001): values come from
-- public.app_settings via public.app_setting(), never from current_setting('app.*') GUCs.
--   apikey         : service_role_key  (legacy key; satisfies the Edge gateway)
--   Authorization  : Bearer <recurring_meetings_cron_secret>  (== CRON_SHARED_SECRET Edge secret)
--
-- DEPLOY ORDER: deploy the new function, then apply this migration immediately after. Until both are in
-- place email dispatch fails CLOSED (in-app notifications are unaffected; the trigger swallows errors).

create or replace function public.dispatch_email_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_url    text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_secret text := public.app_setting('recurring_meetings_cron_secret');
begin
  if v_url is null or v_apikey is null or v_secret is null then
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-notification-email',
    body    := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object(
      'apikey',        v_apikey,
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  );

  return NEW;
exception when others then
  -- Email dispatch must never block notification storage
  return NEW;
end;
$func$;

-- Trigger functions are never meant to be called directly.
revoke all on function public.dispatch_email_on_notification_insert() from public, anon, authenticated;

-- (trigger dispatch_email_on_notification_insert already exists from 20270804000024 and points at this function)
