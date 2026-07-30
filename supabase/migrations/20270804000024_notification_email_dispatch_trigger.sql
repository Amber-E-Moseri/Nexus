-- Trigger: dispatch email on every notifications INSERT
-- Mirrors dispatch_push_on_notification_insert (migration 20270804000015).
-- send-notification-email checks user_notification_prefs.email and skips types
-- with no template, so this is safe to fire for every notification row.

create or replace function public.dispatch_email_on_notification_insert()
returns trigger language plpgsql security definer set search_path = public as $func$
declare
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
begin
  if v_url is null or v_key is null then return NEW; end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/send-notification-email',
    body    := jsonb_build_object(
                 'user_id',           NEW.user_id,
                 'notification_type', NEW.type,
                 'payload',           coalesce(NEW.payload, '{}'::jsonb)
               ),
    headers := jsonb_build_object(
                 'apikey',        v_key,
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'
               )
  );
  return NEW;
exception when others then
  return NEW;
end;
$func$;

drop trigger if exists dispatch_email_on_notification_insert on public.notifications;
create trigger dispatch_email_on_notification_insert
  after insert on public.notifications
  for each row
  execute function public.dispatch_email_on_notification_insert();
