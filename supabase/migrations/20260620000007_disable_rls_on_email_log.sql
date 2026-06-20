-- Disable RLS on email_delivery_log table
-- This table is only for system logging, not user data
-- Service role functions need to write to it without RLS restrictions

alter table public.email_delivery_log disable row level security;
