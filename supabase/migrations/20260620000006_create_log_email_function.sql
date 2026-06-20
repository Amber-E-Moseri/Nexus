-- Create a function to log email deliveries that bypasses RLS
-- This function runs with the role that defines it (bypasses RLS)

create or replace function public.log_email_delivery(
  p_recipient_email text,
  p_sender_email text,
  p_subject text,
  p_email_type text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_resend_email_id text default null,
  p_status text default 'sent',
  p_http_status integer default null,
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  insert into public.email_delivery_log (
    recipient_email,
    sender_email,
    subject,
    email_type,
    related_entity_type,
    related_entity_id,
    resend_email_id,
    status,
    http_status,
    error_message
  )
  values (
    p_recipient_email,
    p_sender_email,
    p_subject,
    p_email_type,
    p_related_entity_type,
    p_related_entity_id,
    p_resend_email_id,
    p_status,
    p_http_status,
    p_error_message
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_email_delivery to anon, authenticated, service_role;
