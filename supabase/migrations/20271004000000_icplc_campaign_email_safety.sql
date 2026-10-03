-- Harden ICPLC campaign email on top of the existing communications tables.
-- Adds only the audit/idempotency fields required for event-scoped mass email.

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS recipient_source text,
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.communication_campaigns
  DROP CONSTRAINT IF EXISTS communication_campaigns_status_check;

ALTER TABLE public.communication_campaigns
  ADD CONSTRAINT communication_campaigns_status_check
  CHECK (status IN ('draft','scheduled','sending','retrying','sent','cancelled','failed'));

CREATE UNIQUE INDEX IF NOT EXISTS communication_campaigns_created_by_idempotency_key_idx
  ON public.communication_campaigns (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.communication_sends
  ADD COLUMN IF NOT EXISTS source_participant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS recipient_email_normalized text,
  ADD COLUMN IF NOT EXISTS recipient_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.communication_sends
SET recipient_email_normalized = lower(btrim(recipient_email))
WHERE recipient_email_normalized IS NULL
  AND recipient_email IS NOT NULL;

ALTER TABLE public.communication_sends
  DROP CONSTRAINT IF EXISTS communication_sends_status_check;

ALTER TABLE public.communication_sends
  ADD CONSTRAINT communication_sends_status_check
  CHECK (status IN ('pending','retrying','sent','failed','opened','bounced','unsubscribed','suppressed','skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS communication_sends_campaign_recipient_email_normalized_idx
  ON public.communication_sends (campaign_id, recipient_email_normalized);
