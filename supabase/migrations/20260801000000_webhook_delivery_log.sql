-- Webhook delivery audit log for automation engine post_webhook actions
create table if not exists public.webhook_delivery_log (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations(id) on delete set null,
  webhook_url text not null,
  payload jsonb,
  response_status integer,
  response_body text,
  delivered_at timestamptz default now(),
  success boolean generated always as (response_status between 200 and 299) stored
);

-- Only super admins can read the webhook log
alter table public.webhook_delivery_log enable row level security;

create policy "super_admin_reads_webhook_log"
  on public.webhook_delivery_log for select
  using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and role = 'super_admin')
  );

create index idx_webhook_delivery_log_automation_id on public.webhook_delivery_log(automation_id);
create index idx_webhook_delivery_log_delivered_at on public.webhook_delivery_log(delivered_at);
create index idx_webhook_delivery_log_success on public.webhook_delivery_log(success);
