-- Email signature editor for campaigns
-- Stores organization-wide email signature in app_settings

-- Ensure app_settings table exists (should be from 20260722000000_scheduled_sends.sql)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

-- Insert or update email_signature entry (initially empty)
insert into public.app_settings (key, value)
values ('email_signature', '')
on conflict (key) do update set value = excluded.value;

-- Create view to retrieve email signature (for convenience)
create or replace view public.organization_email_signature as
  select value as signature from public.app_settings where key = 'email_signature';

grant select on public.organization_email_signature to authenticated;
