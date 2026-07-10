-- Fix 1: Add clicker_email as generated alias for recipient_email in campaign_link_clicks.
-- AnalyticsPage selects "clicker_email" but the column is named "recipient_email".
alter table public.campaign_link_clicks
  add column if not exists clicker_email text generated always as (recipient_email) stored;

-- Fix 2: Add id uuid, campaign_id, and bounced_email to email_bounces.
-- AnalyticsPage selects "id, campaign_id, bounced_email" but the table has none of these.
alter table public.email_bounces
  add column if not exists id         uuid        not null default gen_random_uuid(),
  add column if not exists campaign_id uuid        references public.communication_campaigns(id) on delete set null,
  add column if not exists bounced_email text generated always as (email) stored;

create index if not exists idx_email_bounces_campaign on public.email_bounces(campaign_id);

-- Fix 3: Widen the communication_unsubscribes check constraint to include 'hard_bounce'.
-- The resend-webhook writes unsubscribed_via = 'hard_bounce' for hard bounces,
-- but the original constraint only allowed ('link','manual','bounce','complaint').
alter table public.communication_unsubscribes
  drop constraint if exists communication_unsubscribes_unsubscribed_via_check;

alter table public.communication_unsubscribes
  add constraint communication_unsubscribes_unsubscribed_via_check
  check (unsubscribed_via in ('link', 'manual', 'bounce', 'hard_bounce', 'complaint'));

-- Fix 4: Create increment_campaign_open_count RPC.
-- Called by resend-webhook on email.opened events. Currently missing, causing a
-- caught error on every open event (the fallback path works but logs noise).
create or replace function public.increment_campaign_open_count(campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.communication_campaigns
     set open_count = coalesce(open_count, 0) + 1
   where id = campaign_id;
$$;

-- Fix 5: Create record_campaign_click RPC.
-- Called by the track-click edge function. Uses service role; upserts on the
-- (campaign_id, recipient_email, link_url) unique constraint, incrementing click_count.
create or replace function public.record_campaign_click(
  p_campaign_id     uuid,
  p_recipient_email text,
  p_link_url        text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.campaign_link_clicks (campaign_id, recipient_email, link_url, clicked_at, click_count)
  values (p_campaign_id, p_recipient_email, p_link_url, now(), 1)
  on conflict (campaign_id, recipient_email, link_url)
  do update set
    click_count = campaign_link_clicks.click_count + 1,
    clicked_at  = now();
$$;
