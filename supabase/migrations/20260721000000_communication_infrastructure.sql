-- Communication infrastructure: segments, campaigns, sends, unsubscribes, A/B tests

-- 1. communication_segments
create table public.communication_segments (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  description  text,
  filters      jsonb       not null default '{}',
  estimated_count integer  default 0,
  created_by   uuid        references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2. communication_campaigns
create table public.communication_campaigns (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  subject          text        not null,
  body             text        not null,
  status           text        not null default 'draft'
                               check (status in ('draft','scheduled','sending','sent','cancelled','failed')),
  segment_id       uuid        references public.communication_segments(id) on delete set null,
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  recipient_count  integer     default 0,
  sent_count       integer     default 0,
  failed_count     integer     default 0,
  open_count       integer     default 0,
  created_by       uuid        references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 3. communication_sends
create table public.communication_sends (
  id               uuid        primary key default gen_random_uuid(),
  campaign_id      uuid        references public.communication_campaigns(id) on delete cascade,
  recipient_email  text        not null,
  recipient_name   text        not null,
  status           text        not null default 'pending'
                               check (status in ('pending','sent','failed','opened','bounced','unsubscribed')),
  resend_email_id  text,
  opened_at        timestamptz,
  error_message    text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

-- 4. communication_unsubscribes
create table public.communication_unsubscribes (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null unique,
  full_name         text,
  reason            text,
  unsubscribed_at   timestamptz not null default now(),
  unsubscribed_via  text        default 'link'
                                check (unsubscribed_via in ('link','manual','bounce','complaint'))
);

-- 5. communication_ab_tests
create table public.communication_ab_tests (
  id                    uuid        primary key default gen_random_uuid(),
  campaign_id           uuid        references public.communication_campaigns(id) on delete cascade,
  subject_a             text        not null,
  subject_b             text        not null,
  split_percent         integer     not null default 20
                                    check (split_percent between 5 and 50),
  winner_subject        text,
  winner_chosen_at      timestamptz,
  test_duration_hours   integer     not null default 2,
  metric                text        not null default 'opens'
                                    check (metric in ('opens','clicks')),
  created_at            timestamptz not null default now()
);

-- 6. RLS
alter table public.communication_segments    enable row level security;
alter table public.communication_campaigns   enable row level security;
alter table public.communication_sends       enable row level security;
alter table public.communication_unsubscribes enable row level security;
alter table public.communication_ab_tests    enable row level security;

-- Segments
create policy "comm_segments_select"  on public.communication_segments for select to authenticated using (true);
create policy "comm_segments_insert"  on public.communication_segments for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_segments_update"  on public.communication_segments for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_segments_delete"  on public.communication_segments for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- Campaigns
create policy "comm_campaigns_select" on public.communication_campaigns for select to authenticated using (true);
create policy "comm_campaigns_insert" on public.communication_campaigns for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_campaigns_update" on public.communication_campaigns for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_campaigns_delete" on public.communication_campaigns for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- Sends
create policy "comm_sends_select"     on public.communication_sends for select to authenticated using (true);
create policy "comm_sends_insert"     on public.communication_sends for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_sends_update"     on public.communication_sends for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_sends_delete"     on public.communication_sends for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- Unsubscribes: public insert (unsubscribe link is unauthenticated)
create policy "comm_unsub_select"     on public.communication_unsubscribes for select to authenticated using (true);
create policy "comm_unsub_insert"     on public.communication_unsubscribes for insert to anon, authenticated with check (true);
create policy "comm_unsub_update"     on public.communication_unsubscribes for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_unsub_delete"     on public.communication_unsubscribes for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- AB tests
create policy "comm_ab_select"        on public.communication_ab_tests for select to authenticated using (true);
create policy "comm_ab_insert"        on public.communication_ab_tests for insert to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_ab_update"        on public.communication_ab_tests for update to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin','dept_lead'));
create policy "comm_ab_delete"        on public.communication_ab_tests for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin');

-- 7. Indexes
create index on public.communication_sends (campaign_id, status);
create index on public.communication_sends (recipient_email);
create index on public.communication_sends (resend_email_id) where resend_email_id is not null;
create index on public.communication_unsubscribes (email);
create index on public.communication_campaigns (status, scheduled_at);

-- 8. updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_comm_segments_updated_at
  before update on public.communication_segments
  for each row execute function public.set_updated_at();

create trigger trg_comm_campaigns_updated_at
  before update on public.communication_campaigns
  for each row execute function public.set_updated_at();
