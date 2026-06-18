-- Click tracking: records every link click from a campaign email.
-- The edge function /functions/v1/track-click writes here then redirects.
create table if not exists campaign_link_clicks (
  id           uuid        default gen_random_uuid() primary key,
  campaign_id  uuid        not null references communication_campaigns(id) on delete cascade,
  recipient_email text     not null,
  link_url     text        not null,
  clicked_at   timestamptz default now(),
  click_count  integer     default 1,
  unique (campaign_id, recipient_email, link_url)
);

create index if not exists idx_link_clicks_campaign on campaign_link_clicks(campaign_id);

-- Bounce suppression list.
-- Hard bounces are written here by the resend-webhook function and are
-- excluded from future sends by the edge function before calling Resend.
create table if not exists email_bounces (
  email        text        primary key,
  bounce_type  text        not null default 'hard',  -- 'hard' | 'soft'
  bounced_at   timestamptz default now(),
  suppressed   boolean     default true,
  updated_at   timestamptz default now()
);

-- Automatically update updated_at
create or replace function update_email_bounces_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger email_bounces_updated_at
  before update on email_bounces
  for each row execute function update_email_bounces_updated_at();

-- RPC: select A/B test winner based on open counts per variant.
-- Called from AnalyticsPage when test_duration_hours has elapsed.
-- Requires a subject_variant column on communication_sends (add if missing).
alter table communication_sends
  add column if not exists subject_variant text;  -- 'a' | 'b' | null

create or replace function select_ab_test_winner(p_campaign_id uuid)
returns table(
  winning_variant text,
  open_rate_a     real,
  open_rate_b     real
) language plpgsql security definer as $$
declare
  v_sent_a   int;
  v_opened_a int;
  v_sent_b   int;
  v_opened_b int;
  v_rate_a   real;
  v_rate_b   real;
  v_winner   text;
  v_ab_id    uuid;
begin
  select id into v_ab_id
    from communication_ab_tests
   where campaign_id = p_campaign_id
   limit 1;

  if v_ab_id is null then
    return;
  end if;

  select count(*) into v_sent_a
    from communication_sends
   where campaign_id = p_campaign_id and subject_variant = 'a';

  select count(*) into v_opened_a
    from communication_sends
   where campaign_id = p_campaign_id and subject_variant = 'a' and status = 'opened';

  select count(*) into v_sent_b
    from communication_sends
   where campaign_id = p_campaign_id and subject_variant = 'b';

  select count(*) into v_opened_b
    from communication_sends
   where campaign_id = p_campaign_id and subject_variant = 'b' and status = 'opened';

  v_rate_a := case when v_sent_a > 0 then v_opened_a::real / v_sent_a else 0 end;
  v_rate_b := case when v_sent_b > 0 then v_opened_b::real / v_sent_b else 0 end;
  v_winner := case when v_rate_a >= v_rate_b then 'a' else 'b' end;

  -- Persist rates to ab_tests row
  update communication_ab_tests
     set open_rate_a = v_rate_a,
         open_rate_b = v_rate_b
   where id = v_ab_id;

  return query select v_winner, v_rate_a, v_rate_b;
end;
$$;
