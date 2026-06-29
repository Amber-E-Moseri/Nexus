-- Meeting Module Caching Foundation
-- Removes Redis dependency and implements Supabase-native caching
-- Created: 2026-06-28

BEGIN;

-- ========================================
-- 1. Add caching columns to meetings
-- ========================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS extraction_cache JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_cached_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_cache_valid BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS transcript_hash TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transcription_in_progress BOOLEAN DEFAULT false;

-- ========================================
-- 2. Create indexes for performance
-- ========================================

CREATE INDEX IF NOT EXISTS idx_meetings_transcript_hash ON meetings(transcript_hash);
CREATE INDEX IF NOT EXISTS idx_meetings_in_progress ON meetings(id) WHERE transcription_in_progress = true;

-- ========================================
-- 3. Create user_transcription_quota table
-- ========================================

CREATE TABLE IF NOT EXISTS user_transcription_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL,
  transcription_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, quota_date)
);

CREATE INDEX IF NOT EXISTS idx_user_quota_daily
  ON user_transcription_quota(user_id, quota_date);

-- ========================================
-- 4. Create RPC: increment_transcription_count
-- ========================================

CREATE OR REPLACE FUNCTION increment_transcription_count(p_user_id UUID)
RETURNS TABLE(quota_date DATE, transcription_count INT, exceeded BOOLEAN) AS $$
BEGIN
  INSERT INTO user_transcription_quota (user_id, quota_date, transcription_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, quota_date)
  DO UPDATE SET transcription_count = user_transcription_quota.transcription_count + 1
  RETURNING
    user_transcription_quota.quota_date,
    user_transcription_quota.transcription_count,
    (user_transcription_quota.transcription_count > 10)::BOOLEAN
  INTO quota_date, transcription_count, exceeded;

  RETURN QUERY SELECT quota_date, transcription_count, exceeded;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. Create RPC: start_transcription_lock
-- ========================================

CREATE OR REPLACE FUNCTION start_transcription_lock(p_meeting_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE meetings
  SET transcription_in_progress = true
  WHERE id = p_meeting_id
    AND transcription_in_progress = false;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 6. Enable RLS on new table
-- ========================================

ALTER TABLE user_transcription_quota ENABLE ROW LEVEL SECURITY;

-- Users can only see their own quota
CREATE POLICY "Users see own transcription quota"
  ON user_transcription_quota FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can update (via RPC)
CREATE POLICY "Only service role updates quotas"
  ON user_transcription_quota FOR UPDATE
  USING (auth.uid() IS NULL);

-- ========================================
-- 7. Grant permissions
-- ========================================

GRANT EXECUTE ON FUNCTION increment_transcription_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION start_transcription_lock(UUID) TO authenticated;

COMMIT;

-- ========================================
-- ROLLBACK (if deployment fails)
-- ========================================
/*
BEGIN;

DROP FUNCTION IF EXISTS start_transcription_lock(UUID) CASCADE;
DROP FUNCTION IF EXISTS increment_transcription_count(UUID) CASCADE;
DROP TABLE IF EXISTS user_transcription_quota CASCADE;

ALTER TABLE meetings
  DROP COLUMN IF EXISTS extraction_cache,
  DROP COLUMN IF EXISTS extraction_cached_at,
  DROP COLUMN IF EXISTS extraction_cache_valid,
  DROP COLUMN IF EXISTS transcript_hash,
  DROP COLUMN IF EXISTS transcription_in_progress;

COMMIT;
*/
