-- Communications system deploy fixes.
-- Patches 5 breaking bugs identified in the pre-deploy audit.

-- Fix 1: Add clicker_email to campaign_link_clicks.
--   AnalyticsPage selects this column for unique-clicker counting.
alter table public.campaign_link_clicks
  add column if not exists clicker_email text;

-- Fix 2: email_bounces is a suppression list keyed by email (text PK).
--   AnalyticsPage drilldown queries it with .eq('campaign_id', id) and
--   renders rows keyed on b.id / b.bounced_email — none of which existed.
alter table public.email_bounces
  add column if not exists id            uuid    default gen_random_uuid(),
  add column if not exists campaign_id   uuid    references public.communication_campaigns(id) on delete set null;

create unique index if not exists email_bounces_id_unique on public.email_bounces (id);

-- bounced_email is a read-only alias for the email primary key so the
-- existing UI column name works without changing the analytics query.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'email_bounces'
      and column_name  = 'bounced_email'
  ) then
    alter table public.email_bounces
      add column bounced_email text generated always as (email) stored;
  end if;
end;
$$;

-- Fix 3: communication_unsubscribes check constraint rejects 'hard_bounce'
--   but resend-webhook writes exactly that value on hard-bounce events.
alter table public.communication_unsubscribes
  drop constraint if exists communication_unsubscribes_unsubscribed_via_check;

alter table public.communication_unsubscribes
  add constraint communication_unsubscribes_unsubscribed_via_check
  check (unsubscribed_via in ('link', 'manual', 'bounce', 'complaint', 'hard_bounce'));

-- Fix 4: increment_campaign_open_count RPC.
--   resend-webhook calls this on email.opened events; without it every
--   open event logs a Postgres error before the manual-fallback path runs.
create or replace function public.increment_campaign_open_count(campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_campaigns
     set open_count = coalesce(open_count, 0) + 1
   where id = campaign_id;
end;
$$;

-- Fix 5: record_campaign_click RPC.
--   track-click edge function switches to service role key and calls this
--   instead of posting to the REST endpoint with anon key (which had no
--   INSERT policy and silently dropped every click).
--   Handles click_count increment on repeated clicks from the same address.
create or replace function public.record_campaign_click(
  p_campaign_id     uuid,
  p_recipient_email text,
  p_link_url        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_link_clicks
    (campaign_id, recipient_email, clicker_email, link_url, click_count, clicked_at)
  values
    (p_campaign_id, p_recipient_email, p_recipient_email, p_link_url, 1, now())
  on conflict (campaign_id, recipient_email, link_url)
  do update set
    click_count = public.campaign_link_clicks.click_count + 1,
    clicked_at  = now();
end;
$$;
