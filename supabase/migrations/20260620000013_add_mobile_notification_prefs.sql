-- Add mobile push notification preference column
alter table public.user_notification_prefs
add column mobile boolean not null default false;
