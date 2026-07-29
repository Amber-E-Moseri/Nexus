-- Track which notification rows have been included in a batch email.
-- NULL = pending; non-NULL = already sent (or intentionally skipped due to user pref).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Partial index so the batch job only scans unprocessed rows.
CREATE INDEX IF NOT EXISTS notifications_email_pending_idx
  ON notifications (user_id, created_at DESC)
  WHERE email_sent_at IS NULL;

COMMENT ON COLUMN notifications.email_sent_at IS
  'Set by task-notification-email-batch when the notification is included in (or deliberately excluded from) a digest email. NULL means pending.';
