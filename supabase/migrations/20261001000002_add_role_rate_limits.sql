-- ============================================================
-- Add role_rate_limits table for API rate limiting and budget tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS role_rate_limits (
  role TEXT PRIMARY KEY,
  calls_per_minute INT,
  monthly_budget_usd DECIMAL(10,2),
  email_daily_threshold INT DEFAULT 1000,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  notes TEXT
);

-- Seed initial rate limits for all roles
INSERT INTO role_rate_limits (role, calls_per_minute, monthly_budget_usd, email_daily_threshold) VALUES
('super_admin', NULL, NULL, NULL),
('regional_secretary', 100, 20.00, 5000),
('dept_lead', 50, 15.00, 2000),
('programs', 40, 15.00, 10000),
('ors', 40, 15.00, 5000),
('pastor', 20, 10.00, 500),
('media', 20, 10.00, 500),
('member', 10, 5.00, 500)
ON CONFLICT (role) DO NOTHING;

-- Verify seeding
-- SELECT * FROM role_rate_limits ORDER BY role;
