-- Enable realtime for notifications table so clients receive live push events.
-- Without this, postgres_changes subscriptions silently receive nothing.
alter publication supabase_realtime add table public.notifications;
