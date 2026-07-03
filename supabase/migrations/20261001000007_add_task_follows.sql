-- ============================================================
-- Add task_follows table for task subscription/notification feature
-- ============================================================

CREATE TABLE IF NOT EXISTS task_follows (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  google_event_id TEXT,
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_follows_task_id ON task_follows(task_id);
CREATE INDEX IF NOT EXISTS idx_task_follows_user_id ON task_follows(user_id);

-- Add RLS
ALTER TABLE task_follows ENABLE ROW LEVEL SECURITY;

-- Users can only see their own follows
CREATE POLICY "task_follows_user_isolation"
  ON task_follows FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only create their own follows
CREATE POLICY "task_follows_user_create"
  ON task_follows FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own follows
CREATE POLICY "task_follows_user_delete"
  ON task_follows FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Verify
-- SELECT COUNT(*) FROM task_follows;
