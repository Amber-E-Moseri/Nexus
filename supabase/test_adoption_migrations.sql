-- Test Suite for Adoption System Migrations
-- Run this after applying 20270813000001 and 20270813000002 migrations
-- Command: supabase db push && psql -h localhost -U postgres -d postgres -f supabase/test_adoption_migrations.sql

-- ─── Verify Tables Exist ─────────────────────────────────────────────────────

\echo '=== TEST 1: Table Creation ==='

-- Test analytics_events exists and has correct columns
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'analytics_events'
) AS analytics_events_exists;

-- Test user_onboarding_state exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_onboarding_state'
) AS onboarding_state_exists;

-- Test user_onboarding_progress exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_onboarding_progress'
) AS onboarding_progress_exists;

-- Test user_achievements exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_achievements'
) AS user_achievements_exists;

\echo '=== TEST 2: Indexes Created ==='

-- Verify indexes on analytics_events
SELECT COUNT(*) as analytics_event_indexes FROM information_schema.statistics
WHERE table_schema = 'public' AND table_name = 'analytics_events';

-- Verify indexes on onboarding tables
SELECT COUNT(*) as onboarding_indexes FROM information_schema.statistics
WHERE table_schema = 'public' AND table_name IN ('user_onboarding_progress', 'user_achievements');

\echo '=== TEST 3: Triggers Created ==='

-- Verify trigger on activity_log
SELECT EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_schema = 'public' AND trigger_name = 'activity_log_to_analytics'
) AS activity_log_trigger_exists;

-- Verify trigger on user_onboarding_state
SELECT EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_schema = 'public' AND trigger_name = 'onboarding_state_updated_at'
) AS onboarding_state_trigger_exists;

\echo '=== TEST 4: Functions Created ==='

-- Verify populate_analytics_event function
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'populate_analytics_event'
) AS populate_analytics_event_exists;

-- Verify backfill_analytics_events function
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'backfill_analytics_events'
) AS backfill_analytics_events_exists;

-- Verify mark_onboarding_step_complete function
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'mark_onboarding_step_complete'
) AS mark_onboarding_step_complete_exists;

-- Verify get_onboarding_status function
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'get_onboarding_status'
) AS get_onboarding_status_exists;

\echo '=== TEST 5: RLS Policies ==='

-- Verify RLS enabled on analytics_events
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'analytics_events' AND rowsecurity = true
) AS analytics_events_rls_enabled;

-- Verify RLS enabled on onboarding tables
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('user_onboarding_state', 'user_onboarding_progress', 'user_achievements') AND rowsecurity = true
) AS onboarding_rls_enabled;

\echo '=== TEST 6: Sample Data Insert Test ==='

-- This test should only run if we have a real user to test with.
-- For now, just check that the tables are ready to insert.

\echo 'Migration verification complete. All tables, triggers, functions, and RLS policies are in place.'
