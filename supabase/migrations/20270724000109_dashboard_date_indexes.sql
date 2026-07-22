-- =============================================================================
-- Fix: pages loading slowly, especially the dashboard
-- -----------------------------------------------------------------------------
-- pg_stat_statements shows get_dashboard_data() — the RPC every dashboard
-- load calls — averaging 404ms/call and 140s cumulative across 346 calls,
-- the single most expensive query in the app. It runs five separate
-- subqueries filtering tasks.due_date / tasks.completed_at (today/overdue/
-- this-week counts, completion rate, overdue-by-member), and one filtering
-- meetings.date (meetings_this_week) — none of which had a usable index,
-- forcing a full sequential scan of both tables on every single dashboard
-- load. A separate ad-hoc meetings date-range query (calendar view) shows
-- the same pattern independently: 72 calls averaging 167ms, another 26
-- averaging 230ms — both full scans for the same reason.
--
-- tasks.due_date is already `date` (not timestamptz), so the `due_date::date`
-- casts used throughout get_dashboard_data are no-ops — a plain btree index
-- serves them directly, no expression index needed.
-- =============================================================================

create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_completed_at_idx on public.tasks (completed_at);
create index if not exists meetings_date_idx on public.meetings (date);
