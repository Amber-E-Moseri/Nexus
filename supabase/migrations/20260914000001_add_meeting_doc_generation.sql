BEGIN;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_notes TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS doc_drive_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS doc_title TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS doc_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_doc_drive_url ON meetings(doc_drive_url) WHERE doc_drive_url IS NOT NULL;

COMMIT;
