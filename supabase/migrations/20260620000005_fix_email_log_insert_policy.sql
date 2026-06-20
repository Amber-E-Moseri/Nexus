-- Allow service role to insert email delivery logs
-- The edge function runs with service role credentials and needs to log deliveries

create policy "allow_service_role_insert_logs"
  on public.email_delivery_log for insert
  with check (true);

-- Also allow service role to update status (for tracking bounces, opens, etc)
create policy "allow_service_role_update_logs"
  on public.email_delivery_log for update
  using (true)
  with check (true);
