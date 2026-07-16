-- ============================================================================
-- INVITATION CAMPAIGNS (event RSVP invites) — real schema, replaces the
-- disabled .bak_20260625000000_invitation_system_core_schema.sql draft.
--
-- Distinct from:
--   - user_invitations   — inviting a person onto the PLATFORM (do not confuse)
--   - communication_campaigns/communication_sends — mass email blasts to a
--     segment, no event/RSVP concept at all
--
-- Differences from the disabled draft (see plan doc for full rationale):
--   - No org_id/organizations — this app is single-tenant; that table never
--     existed here.
--   - No event_date/event_time/event_location typed columns — the wizard
--     (Step2EventDetails.jsx) is template-slot-driven and produces an
--     arbitrary {slot: value} map, not fixed fields. Event details live in
--     `content` jsonb instead.
--   - template_id kept but unenforced (no FK) — invitation_templates doesn't
--     exist yet (Step1PickTemplate.jsx is currently stubbed to zero templates).
--   - html_content is nullable — nothing populates it today; send-invitations
--     builds the email HTML inline regardless.
--   - created_by/recipient_user_id reference public.users(id), not
--     auth.users(id), matching house convention elsewhere.
--   - No bespoke invitation_activity_log table — reuses the existing generic
--     public.activity_log.
--   - RLS uses public.current_user_role() (hardened JWT+DB-fallback helper),
--     not the raw auth.jwt()->>'role' style the draft used.
-- ============================================================================

create table if not exists public.invitation_campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid,

  title text not null,
  description text,
  content jsonb not null default '{}',

  subject_line text not null default 'You''re invited!',
  preview_text text,
  html_content text,
  theme_config jsonb not null default '{}',
  template_variables jsonb not null default '{}',

  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'archived')),
  scheduled_at timestamptz,
  sent_at timestamptz,

  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  recipient_count int not null default 0,
  sent_count int not null default 0,
  rsvp_yes int not null default 0,
  rsvp_no int not null default 0,
  rsvp_maybe int not null default 0,

  reminder_3d_sent boolean not null default false,
  reminder_1d_sent boolean not null default false
);

create table if not exists public.invitation_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.invitation_campaigns(id) on delete cascade,

  recipient_email text not null,
  recipient_name text,
  recipient_user_id uuid references public.users(id) on delete set null,

  custom_fields jsonb not null default '{}',

  rsvp_token text not null unique,
  rsvp_response text not null default 'pending' check (rsvp_response in ('pending', 'yes', 'no', 'maybe')),
  rsvp_at timestamptz,
  rsvp_notes text check (char_length(rsvp_notes) <= 500),

  -- Delivery status — deliberately separate from rsvp_response so "opened but
  -- never responded" is distinguishable from "responded no".
  status text not null default 'pending' check (status in ('pending', 'sent', 'bounced', 'complained')),
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_campaign_email unique (campaign_id, recipient_email)
);

create index if not exists idx_invitation_recipients_rsvp_token on public.invitation_recipients(rsvp_token);
create index if not exists idx_invitation_recipients_campaign_response on public.invitation_recipients(campaign_id, rsvp_response);
create index if not exists idx_invitation_recipients_user_id on public.invitation_recipients(recipient_user_id);
create index if not exists idx_invitation_campaigns_status on public.invitation_campaigns(status);
create index if not exists idx_invitation_campaigns_created_by on public.invitation_campaigns(created_by);

-- ─── updated_at triggers — reuse the existing helper ────────────────────

create trigger trg_invitation_campaigns_updated_at
  before update on public.invitation_campaigns
  for each row execute function public.set_updated_at();

create trigger trg_invitation_recipients_updated_at
  before update on public.invitation_recipients
  for each row execute function public.set_updated_at();

-- ─── Denormalized RSVP counts ────────────────────────────────────────────

create or replace function public.update_campaign_rsvp_counts()
returns trigger
language plpgsql
as $$
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
  from public.invitation_recipients
  where campaign_id = new.campaign_id;

  update public.invitation_campaigns
  set rsvp_yes = v_yes, rsvp_no = v_no, rsvp_maybe = v_maybe
  where id = new.campaign_id;

  return new;
end;
$$;

create trigger trg_update_rsvp_counts
  after insert or update on public.invitation_recipients
  for each row
  execute function public.update_campaign_rsvp_counts();

-- ─── RLS ──────────────────────────────────────────────────────────────────
-- No anon grants on either table — guests never query them directly.
-- Anonymous RSVP submission goes through the submit_rsvp() function only
-- (see the companion RPC migration), matching the preview_user_invitation
-- pattern: function-mediated access, not permissive table RLS for guests.

alter table public.invitation_campaigns enable row level security;
alter table public.invitation_recipients enable row level security;

create policy "invitation_campaigns_select" on public.invitation_campaigns
  for select to authenticated using (true);

create policy "invitation_campaigns_insert" on public.invitation_campaigns
  for insert to authenticated
  with check (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

create policy "invitation_campaigns_update" on public.invitation_campaigns
  for update to authenticated
  using (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

create policy "invitation_campaigns_delete" on public.invitation_campaigns
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

create policy "invitation_recipients_select" on public.invitation_recipients
  for select to authenticated using (true);

create policy "invitation_recipients_insert" on public.invitation_recipients
  for insert to authenticated
  with check (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

create policy "invitation_recipients_update" on public.invitation_recipients
  for update to authenticated
  using (public.current_user_role() in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin'));

create policy "invitation_recipients_delete" on public.invitation_recipients
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

comment on table public.invitation_campaigns is
  'Event RSVP invite campaigns (wedding-invitation style) — distinct from user_invitations (platform account invites) and communication_campaigns (mass email blasts).';
comment on table public.invitation_recipients is
  'Individual recipients per invitation_campaigns row. One row = one email + one RSVP token.';
comment on column public.invitation_recipients.rsvp_token is
  'Secure token embedded in the email as /rsvp?token={rsvp_token}. Maps to the public RSVPPage.';
comment on column public.invitation_recipients.rsvp_response is
  'Guest RSVP outcome: pending/yes/no/maybe. Kept separate from status (delivery tracking).';
