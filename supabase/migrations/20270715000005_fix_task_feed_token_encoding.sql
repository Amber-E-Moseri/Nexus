-- PostgreSQL's encode() does not support 'base64url' — only 'base64', 'hex', 'escape'.
-- The original table DEFAULT used 'base64url' and 400s on every INSERT.
-- Fix: switch to standard base64 then convert to url-safe form inline.
-- base64url = base64 with + → -, / → _, and padding stripped.

ALTER TABLE public.task_feed_subscriptions
  ALTER COLUMN token SET DEFAULT
    replace(replace(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_');

-- Backfill any rows that were inserted with a NULL token due to the encoding error.
UPDATE public.task_feed_subscriptions
SET token = replace(replace(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_')
WHERE token IS NULL OR token = '';
