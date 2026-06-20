-- Email delivery audit log for tracking invitation and notification emails
create table if not exists public.email_delivery_log (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  sender_email text not null,
  subject text not null,
  email_type text not null, -- 'sprint_invite', 'notification', etc.
  related_entity_type text, -- 'sprint', 'invitation', etc.
  related_entity_id uuid,
  resend_email_id text, -- ID returned by Resend API
  status text not null default 'pending', -- 'pending', 'sent', 'failed', 'bounced', 'opened', 'clicked'
  http_status integer, -- HTTP status from Resend API
  error_message text,
  sent_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.email_delivery_log enable row level security;

-- Only the user who received the email or super admins can read their own logs
create policy "users_can_read_own_email_logs"
  on public.email_delivery_log for select
  using (
    exists (select 1 from public.users where public.users.id = auth.uid() and role = 'super_admin')
    or recipient_email = (select email from auth.users where id = auth.uid())
  );

create index idx_email_delivery_log_recipient_email on public.email_delivery_log(recipient_email);
create index idx_email_delivery_log_email_type on public.email_delivery_log(email_type);
create index idx_email_delivery_log_status on public.email_delivery_log(status);
create index idx_email_delivery_log_sent_at on public.email_delivery_log(sent_at);
create index idx_email_delivery_log_resend_id on public.email_delivery_log(resend_email_id);
