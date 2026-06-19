-- ============================================================================
-- Sprint Teams Decoupling Migration
-- Phase 1: Database Schema Changes
-- ============================================================================
-- Run these migrations in Supabase SQL Editor
-- IMPORTANT: Backup database before running in production
-- ============================================================================

-- Step 1: Alter sprint_teams table to support independent teams
-- Make sprint_id nullable (allows teams without sprints)
ALTER TABLE sprint_teams
ALTER COLUMN sprint_id DROP NOT NULL;

-- Add source_space_id to track teams created from spaces
ALTER TABLE sprint_teams
ADD COLUMN source_space_id uuid REFERENCES spaces(id) ON DELETE SET NULL;

-- Add is_archived for soft deletes (prefer over hard delete)
ALTER TABLE sprint_teams
ADD COLUMN is_archived boolean DEFAULT false;

-- Add created_by for audit trail
ALTER TABLE sprint_teams
ADD COLUMN created_by uuid REFERENCES users(id);

-- Create indexes for new columns
CREATE INDEX idx_sprint_teams_source_space ON sprint_teams(source_space_id);
CREATE INDEX idx_sprint_teams_is_archived ON sprint_teams(is_archived);
CREATE INDEX idx_sprint_teams_created_by ON sprint_teams(created_by);

-- ============================================================================
-- Step 2: Create sprint_team_members table (new)
-- Decouples members from sprint_members, allowing cross-sprint teams
-- ============================================================================

CREATE TABLE sprint_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES sprint_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_sprint_team_members_team_id ON sprint_team_members(team_id);
CREATE INDEX idx_sprint_team_members_user_id ON sprint_team_members(user_id);

-- ============================================================================
-- Step 3: Enable RLS on sprint_team_members table
-- ============================================================================

ALTER TABLE sprint_team_members ENABLE ROW LEVEL SECURITY;

-- Read Policy: Users can read team members if in org
CREATE POLICY "Users can read team members if in org" ON sprint_team_members
  FOR SELECT
  USING (
    -- Allow if user is part of the organization (simplified)
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'active'
    )
  );

-- Insert Policy: Team creators can add members
CREATE POLICY "Team creators can add members" ON sprint_team_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sprint_teams st
      WHERE st.id = team_id
      AND st.created_by = auth.uid()
    )
  );

-- Delete Policy: Team creators can remove members
CREATE POLICY "Team creators can remove members" ON sprint_team_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sprint_teams st
      WHERE st.id = team_id
      AND st.created_by = auth.uid()
    )
  );

-- ============================================================================
-- Step 4: Update RLS on sprint_teams table (optional enhancement)
-- ============================================================================

-- Read Policy: Users can read teams (existing organizations)
CREATE POLICY "Users can read all teams" ON sprint_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'active'
    )
  );

-- Create Policy: Users can create independent teams
CREATE POLICY "Users can create teams" ON sprint_teams
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
  );

-- Update Policy: Creators can update their teams
CREATE POLICY "Creators can update their teams" ON sprint_teams
  FOR UPDATE
  USING (
    created_by = auth.uid()
  );

-- Delete Policy: Creators can archive their teams
CREATE POLICY "Creators can archive teams" ON sprint_teams
  FOR DELETE
  USING (
    created_by = auth.uid()
  );

-- ============================================================================
-- Rollback Instructions (if needed)
-- ============================================================================
/*
-- To rollback, run these in reverse order:
DROP TABLE IF EXISTS sprint_team_members CASCADE;

ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS created_by CASCADE;

ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS is_archived CASCADE;

ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS source_space_id CASCADE;

ALTER TABLE sprint_teams
ALTER COLUMN sprint_id SET NOT NULL;

DROP INDEX IF EXISTS idx_sprint_teams_source_space;
DROP INDEX IF EXISTS idx_sprint_teams_is_archived;
DROP INDEX IF EXISTS idx_sprint_teams_created_by;
*/

-- ============================================================================
-- Verification Queries (after migration)
-- ============================================================================
-- Run these to verify the migration succeeded

-- Check sprint_teams columns
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'sprint_teams'
-- ORDER BY ordinal_position;

-- Check sprint_team_members table exists
-- SELECT tablename FROM pg_tables WHERE tablename = 'sprint_team_members';

-- Check RLS is enabled
-- SELECT * FROM information_schema.tables
-- WHERE table_name IN ('sprint_teams', 'sprint_team_members');
