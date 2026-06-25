-- ============================================================================
-- NEXUS INVITATIONS CORE SCHEMA
-- Phase: RSVP System Foundation
-- Created: 2026-06-25
-- Author: Amber
-- ============================================================================

-- 1. Main campaign/batch table
create table if not exists invitation_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid references communication_templates(id) on delete set null,

  -- Campaign metadata
  title text not null,
  description text,
  event_date date not null,
  event_time time not null,
  event_location text,

  -- Content & rendering
  subject_line text not null,
  preview_text text,
  html_content text not null,
  theme_config jsonb default '{}', -- {colors, fonts, layout, logo_url, etc}
  template_variables jsonb default '{}', -- {eventTitle, eventDate, eventTime, guestCount, etc}

  -- Status & timing
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'archived')),
  scheduled_at timestamp with time zone,
  sent_at timestamp with time zone,

  -- Creator & audit
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- Counts (denormalized for performance)
  recipient_count int default 0,
  sent_count int default 0,
  rsvp_yes int default 0,
  rsvp_no int default 0,
  rsvp_maybe int default 0,

  -- Reminders
  reminder_3d_sent boolean default false,
  reminder_1d_sent boolean default false
);

-- 2. Individual recipient tracking (one row per email + RSVP status)
create table if not exists invitation_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references invitation_campaigns(id) on delete cascade,

  -- Recipient info
  recipient_email text not null,
  recipient_name text,
  recipient_user_id uuid references auth.users(id) on delete set null,

  -- Custom fields (merge tokens)
  custom_fields jsonb default '{}', -- {customField1: "value", dept: "Pastors", etc}

  -- RSVP tracking (THE KEY NEW FEATURE)
  rsvp_token text not null unique, -- Secure token: 48-char alphanumeric
  rsvp_response text default 'pending' check (
    rsvp_response in ('pending', 'yes', 'no', 'maybe')
  ),
  rsvp_at timestamp with time zone,
  rsvp_notes text, -- Optional: guest can add notes when RSVP'ing

  -- Email delivery tracking
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'bounced', 'complained')
  ),
  sent_at timestamp with time zone,

  -- Audit
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint unique_campaign_email unique (campaign_id, recipient_email)
);

-- 3. Index for fast RSVP lookups (most important)
create index idx_invitation_recipients_rsvp_token
  on invitation_recipients(rsvp_token);
create index idx_invitation_recipients_campaign_response
  on invitation_recipients(campaign_id, rsvp_response);
create index idx_invitation_recipients_user_id
  on invitation_recipients(recipient_user_id);

-- 4. Index for campaign queries
create index idx_invitation_campaigns_org_id
  on invitation_campaigns(org_id);
create index idx_invitation_campaigns_status
  on invitation_campaigns(status);
create index idx_invitation_campaigns_event_date
  on invitation_campaigns(event_date);

-- 5. RLS Policies
alter table invitation_campaigns enable row level security;
alter table invitation_recipients enable row level security;

-- invitation_campaigns: ORS/dept_lead can create & view own org; super_admin can view all
create policy "invitation_campaigns_select" on invitation_campaigns
  for select using (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    or (auth.jwt() ->> 'role') = 'super_admin'
  );

create policy "invitation_campaigns_insert" on invitation_campaigns
  for insert with check (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    and (auth.jwt() ->> 'role') in ('dept_lead', 'pastor', 'super_admin')
  );

create policy "invitation_campaigns_update" on invitation_campaigns
  for update using (
    (org_id = (auth.jwt() ->> 'org_id')::uuid
      and (auth.jwt() ->> 'role') in ('dept_lead', 'pastor', 'super_admin'))
    or (auth.jwt() ->> 'role') = 'super_admin'
  )
  with check (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    or (auth.jwt() ->> 'role') = 'super_admin'
  );

-- invitation_recipients: Same as campaigns
create policy "invitation_recipients_select" on invitation_recipients
  for select using (
    (select org_id from invitation_campaigns where id = campaign_id)
    = (auth.jwt() ->> 'org_id')::uuid
    or (auth.jwt() ->> 'role') = 'super_admin'
  );

create policy "invitation_recipients_insert" on invitation_recipients
  for insert with check (
    (select org_id from invitation_campaigns where id = campaign_id)
    = (auth.jwt() ->> 'org_id')::uuid
  );

-- 6. Activity log entries (audit trail)
create table if not exists invitation_activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references invitation_campaigns(id) on delete cascade,
  action text not null, -- 'created', 'scheduled', 'sent', 'reminder_sent'
  actor_id uuid references auth.users(id),
  metadata jsonb default '{}',
  created_at timestamp with time zone not null default now()
);

-- 7. Trigger: Update denormalized counts on recipient RSVP
create or replace function update_campaign_rsvp_counts()
returns trigger as $$
declare
  v_yes int;
  v_no int;
  v_maybe int;
begin
  select
    count(*) filter (where rsvp_response = 'yes'),
    count(*) filter (where rsvp_response = 'no'),
    count(*) filter (where rsvp_response = 'maybe')
  into v_yes, v_no, v_maybe
  from invitation_recipients
  where campaign_id = new.campaign_id;
  update invitation_campaigns
  set rsvp_yes = v_yes, rsvp_no = v_no, rsvp_maybe = v_maybe
  where id = new.campaign_id;
  return new;
end;
$$ language plpgsql;

create trigger tr_update_rsvp_counts
  after insert or update on invitation_recipients
  for each row
  execute function update_campaign_rsvp_counts();

-- 8. Trigger: Update sent_at on status change to 'sent'
create or replace function update_invitation_sent_timestamp()
returns trigger as $$
begin
  if new.status = 'sent' and old.status != 'sent' then
    new.sent_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_update_sent_at
  before update on invitation_recipients
  for each row
  execute function update_invitation_sent_timestamp();

-- 9. Comments for documentation
comment on table invitation_campaigns is
  'Batch invitation campaigns (like events). One campaign = one batch of invites to guests.';
comment on table invitation_recipients is
  'Individual recipients per campaign. Each row = one email + one RSVP token.';
comment on column invitation_recipients.rsvp_token is
  'Secure 48-char token. Embedded in email as /rsvp?token={rsvp_token}. Maps to public RSVP page.';
comment on column invitation_recipients.rsvp_response is
  'Guest RSVP status: pending (not yet), yes (confirmed), no (declined), maybe (unsure).';
