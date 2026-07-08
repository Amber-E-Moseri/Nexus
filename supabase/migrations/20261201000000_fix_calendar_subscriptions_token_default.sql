-- Fix: Add DEFAULT token generation to calendar_subscriptions
-- Problem: token is NOT NULL but has no DEFAULT, causing upsert/insert failures
-- Solution: Use the same token generation pattern as generate_ical_token RPC

ALTER TABLE public.calendar_subscriptions
  ALTER COLUMN token SET DEFAULT (substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 64));
