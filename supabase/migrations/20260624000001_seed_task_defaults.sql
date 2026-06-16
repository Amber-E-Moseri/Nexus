-- =============================================================================
-- Seed task defaults
-- =============================================================================
-- NOTE: task_statuses table does not exist in this schema. The tasks table
-- uses a plain status TEXT column. Only the department seed is applied here.
--
-- departments actual columns: id, name, color, health_status, created_at
-- (no 'type' column — original spec adjusted accordingly)
-- =============================================================================

-- 1. Default department if none exists
INSERT INTO public.departments (id, name, color, health_status)
VALUES ('00000000-0000-0000-0000-000000000001', 'General', '4C2A92', 'on_track')
ON CONFLICT (id) DO NOTHING;
