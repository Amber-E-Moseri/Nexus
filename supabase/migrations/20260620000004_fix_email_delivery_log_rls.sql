-- Fix email_delivery_log RLS policy to be simpler and more reliable
drop policy if exists "users_can_read_own_email_logs" on public.email_delivery_log;

-- Super admins can read all email logs
create policy "super_admin_reads_email_logs"
  on public.email_delivery_log for select
  using (
    exists (select 1 from public.users where public.users.id = auth.uid() and role = 'super_admin')
  );
