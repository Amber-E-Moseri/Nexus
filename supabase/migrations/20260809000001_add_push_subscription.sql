-- Add push notification columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscribed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_enabled boolean DEFAULT false;

-- Index for performance when querying push-enabled users
CREATE INDEX IF NOT EXISTS idx_users_push_enabled ON users(push_enabled) WHERE push_enabled = true;

-- Index for pagination/sorting
CREATE INDEX IF NOT EXISTS idx_users_push_subscribed_at ON users(push_subscribed_at DESC) WHERE push_enabled = true;
