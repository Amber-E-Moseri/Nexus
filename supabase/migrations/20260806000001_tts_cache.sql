-- TTS Cache: shared server-side cache for generated audio segments.
-- Audio is cached in Supabase Storage (tts-cache bucket) and indexed here.
-- Cache key is a SHA256 of (normalized_text|voice|provider|model|language|speed|version)
-- so identical text + voice always maps to one storage file, shared across all users.

CREATE TABLE tts_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key        TEXT UNIQUE NOT NULL,
  book_id          UUID,
  segment_id       TEXT,
  -- text_hash: SHA256 of normalized text alone. Not used for cache lookup, but
  -- lets admin/cleanup find all voice variants of the same text (e.g. bulk-delete
  -- on book content update).
  text_hash        TEXT NOT NULL,
  voice_id         TEXT NOT NULL,
  provider         TEXT NOT NULL DEFAULT 'openai',
  model            TEXT NOT NULL DEFAULT 'tts-1',
  language         TEXT NOT NULL DEFAULT 'en',
  speed            NUMERIC NOT NULL DEFAULT 1.0,
  tts_version      TEXT NOT NULL DEFAULT 'v1',
  status           TEXT NOT NULL DEFAULT 'generating'
                   CHECK (status IN ('generating', 'ready', 'failed')),
  storage_path     TEXT,
  duration_ms      INTEGER,
  size_bytes       BIGINT,
  error_message    TEXT,
  access_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tts_cache_status_idx  ON tts_cache (status);
CREATE INDEX tts_cache_book_idx    ON tts_cache (book_id)     WHERE book_id IS NOT NULL;
CREATE INDEX tts_cache_segment_idx ON tts_cache (segment_id)  WHERE segment_id IS NOT NULL;
CREATE INDEX tts_cache_text_idx    ON tts_cache (text_hash);
-- Used by cleanup job to find stuck 'generating' rows quickly
CREATE INDEX tts_cache_stale_idx   ON tts_cache (updated_at)  WHERE status = 'generating';
-- Used by LRU eviction
CREATE INDEX tts_cache_lru_idx     ON tts_cache (last_accessed_at) WHERE status = 'ready';

ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (to poll status and get signed URLs via the edge fn)
CREATE POLICY "tts_cache_read" ON tts_cache
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy for non-service-role users.
-- The generate-tts edge function uses the service_role key and bypasses RLS entirely.

-- Atomic access counter increment called by generate-tts edge function on cache hits
CREATE OR REPLACE FUNCTION increment_tts_access(p_cache_key TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tts_cache
  SET access_count = access_count + 1,
      last_accessed_at = now()
  WHERE cache_key = p_cache_key;
$$;
