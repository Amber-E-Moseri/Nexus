-- Add Web Push subscription columns to users table.
-- These are required by webPush.js and send-task-push-notification edge function.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_subscription    JSONB,
  ADD COLUMN IF NOT EXISTS push_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS push_subscribed_at   TIMESTAMPTZ;
