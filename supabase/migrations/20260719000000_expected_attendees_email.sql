alter table public.expected_attendees
  add column if not exists email text;

create table if not exists public.absence_email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null,
  body       text not null,
  is_default boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.absence_email_log (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid references public.meeting_attendance_reports(id) on delete set null,
  recipient_name  text not null,
  recipient_email text not null,
  subject         text not null,
  body            text not null,
  status          text not null default 'sent'
                  check (status in ('sent', 'failed', 'pending')),
  error_message   text,
  sent_by         uuid references public.users(id) on delete set null,
  sent_at         timestamptz not null default now()
);

insert into public.absence_email_templates (name, subject, body, is_default)
select
  'Regional Meeting Follow-up',
  'We missed you at our last meeting 💜',
  'Good evening {{name}},

We missed you at our last regional meeting — {{meeting_label}}.

{{recap}}

Our next meeting is coming up on {{next_date}}. We would
love to see you there!

In the meantime, we are checking in on you. Please do not
hesitate to reach out to your subgroup pastor if you need
anything at all.

With love,
BLW CAN NEXUS Team',
  true
where not exists (
  select 1
  from public.absence_email_templates
  where is_default = true
);

drop trigger if exists absence_email_templates_updated_at on public.absence_email_templates;
create trigger absence_email_templates_updated_at
  before update on public.absence_email_templates
  for each row execute function public.set_updated_at();

alter table public.absence_email_templates enable row level security;
alter table public.absence_email_log enable row level security;

create policy "absence_email_templates_select"
  on public.absence_email_templates
  for select
  to authenticated
  using (true);

create policy "absence_email_templates_write"
  on public.absence_email_templates
  for all
  to authenticated
  using ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead'))
  with check ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead'));

create policy "absence_email_log_select"
  on public.absence_email_log
  for select
  to authenticated
  using (true);

create policy "absence_email_log_insert"
  on public.absence_email_log
  for insert
  to authenticated
  with check (true);

create policy "absence_email_log_delete"
  on public.absence_email_log
  for delete
  to authenticated
  using ((auth.jwt() ->> 'user_role') = 'super_admin');
