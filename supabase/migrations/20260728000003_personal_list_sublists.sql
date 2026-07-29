-- Personal List Sublists: Single-level nesting for personal task organization
-- Allows users to organize private tasks into named buckets (e.g., "This Week", "Someday")

-- Create personal_lists table
CREATE TABLE personal_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  sort_order bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Case-insensitive name uniqueness per user
CREATE UNIQUE INDEX personal_lists_unique_name_per_user ON personal_lists(user_id, LOWER(name));

-- Prevent duplicate default sublists per user
CREATE UNIQUE INDEX personal_lists_one_default_per_user ON personal_lists(user_id) WHERE is_default;

-- Efficient sublist queries
CREATE INDEX personal_lists_user_id_idx ON personal_lists(user_id, sort_order);

-- Enable RLS
ALTER TABLE personal_lists ENABLE ROW LEVEL SECURITY;

-- Owner-only access policy (wrapped in subquery for RLS perf rewrite pattern)
CREATE POLICY personal_lists_owner ON personal_lists
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Add personal_sublist_id to tasks table (for is_personal tasks only)
ALTER TABLE tasks
  ADD COLUMN personal_sublist_id uuid REFERENCES personal_lists(id) ON DELETE RESTRICT;

-- Index for efficient personal task sublist queries
CREATE INDEX tasks_personal_sublist_id_idx ON tasks(personal_sublist_id, is_personal) WHERE is_personal = true;

-- BEFORE DELETE trigger on personal_lists:
-- - Guard default deletion (DB-level)
-- - Reassign personal tasks to user's default sublist before row is deleted
CREATE OR REPLACE FUNCTION reassign_personal_tasks_on_sublist_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of default sublist (DB-level guard, not just UI)
  IF OLD.is_default THEN
    RAISE EXCEPTION 'Cannot delete the default sublist';
  END IF;

  -- Reassign personal tasks to this user's default sublist before row is deleted
  -- Only affects personal tasks (is_personal = true) that belong to this user
  UPDATE tasks
  SET personal_sublist_id = (SELECT id FROM personal_lists WHERE user_id = OLD.user_id AND is_default)
  WHERE personal_sublist_id = OLD.id AND is_personal = true;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personal_lists_delete_trigger
BEFORE DELETE ON personal_lists
FOR EACH ROW
EXECUTE FUNCTION reassign_personal_tasks_on_sublist_delete();
