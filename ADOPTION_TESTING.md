# Release 1 Adoption System — Testing Guide

## Prerequisites

1. Docker Desktop must be running
2. Supabase CLI installed (`npm install -g supabase`)
3. Node 18+ and npm installed
4. Current directory: `C:\Users\moser\Downloads\clickup`

## Step 1: Start Local Supabase

```bash
supabase start
```

Wait for all services to start. You should see:
```
Local development server is running.

API URL: http://localhost:54321
GraphQL URL: http://localhost:54321/graphql/v1
DB URL: postgresql://postgres:postgres@localhost:5432/postgres
Studio URL: http://localhost:54323
Inbucket URL: http://localhost:54324
```

## Step 2: Apply Migrations

```bash
supabase db push
```

This will apply:
- `20270813000001_analytics_foundation.sql` — Creates analytics_events table, trigger, and backfill function
- `20270813000002_onboarding_tables.sql` — Creates onboarding tables, achievements, and RPCs

Verify output includes:
```
Applying migration: 20270813000001_analytics_foundation.sql
Applying migration: 20270813000002_onboarding_tables.sql
✓ Migrations applied successfully
```

## Step 3: Verify Database Schema

```bash
supabase db pull
```

This generates a fresh `schema.sql` snapshot. Check that it includes:

### analytics_events table
```sql
CREATE TABLE public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  actor_id uuid not null references public.users(id),
  target_type text,
  target_id uuid,
  department_id uuid references public.departments(id),
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  source text not null default 'activity_log'
);
```

### Onboarding tables
```sql
CREATE TABLE public.user_onboarding_state (
  user_id uuid primary key references public.users(id),
  onboarding_version integer not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

CREATE TABLE public.user_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  step_key text not null,
  completed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, step_key)
);

CREATE TABLE public.user_achievements (
  user_id uuid not null references public.users(id),
  achievement_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);
```

### Triggers
- `activity_log_to_analytics` on activity_log
- `onboarding_state_updated_at` on user_onboarding_state
- `onboarding_progress_updated_at` on user_onboarding_progress

### Functions
- `populate_analytics_event()` — Converts activity_log to analytics_events
- `backfill_analytics_events(p_from timestamptz, p_to timestamptz)` — Backfill historical data
- `mark_onboarding_step_complete(p_step_key text, p_total_steps integer, p_metadata jsonb)` — RPC
- `dismiss_onboarding()` — RPC
- `get_onboarding_status(p_user_id uuid)` — RPC

## Step 4: Test Activity Log Trigger

Open Supabase Studio at http://localhost:54323 and:

1. Create a new task via the dashboard (or API)
2. In Studio → SQL Editor, run:
   ```sql
   SELECT COUNT(*) FROM public.activity_log WHERE action = 'task_created' ORDER BY timestamp DESC LIMIT 1;
   ```
   Should return at least 1 row.

3. In the same SQL Editor, check if the trigger fired:
   ```sql
   SELECT event, actor_id, target_type, target_id, occurred_at 
   FROM public.analytics_events 
   WHERE event = 'task_created' 
   ORDER BY occurred_at DESC 
   LIMIT 1;
   ```
   
   **Expected:** The row count should match or be close to activity_log. If analytics_events is empty or has far fewer rows, the trigger may have failed silently (check PostgreSQL logs).

## Step 5: Test Onboarding State RPC

In Studio SQL Editor:

```sql
-- Get your current user ID (assuming you're logged in as the first user)
SELECT id FROM public.users LIMIT 1 \gset user_id

-- Call the RPC to get onboarding status
SELECT * FROM public.get_onboarding_status(:'user_id'::uuid);
```

Expected response:
```json
{
  "started_at": "2027-08-13T...",
  "completed_at": null,
  "dismissed_at": null,
  "last_seen_at": null,
  "onboarding_version": 1,
  "steps": []
}
```

## Step 6: Test Mark Onboarding Step Complete

In Studio SQL Editor:

```sql
-- Mark a step as complete
SELECT * FROM public.mark_onboarding_step_complete(
  'profile_complete'::text,
  5::integer,
  '{}'::jsonb
);

-- Verify the step was marked complete
SELECT * FROM public.user_onboarding_progress 
WHERE step_key = 'profile_complete' 
LIMIT 1;
```

Expected: `completed_at` is now NOT NULL.

## Step 7: Start Dev Server

In a new terminal:

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 8: Test Onboarding Checklist Component

1. Log in to the app
2. Navigate to Dashboard
3. Verify the "Welcome to Nexus 👋" onboarding checklist appears
4. Verify it shows "0 of 5 complete" (or your role's step count)
5. Click "Go" on the first step (usually "Complete your profile")
6. You should be redirected to `/settings/profile`
7. Go back to Dashboard — the checklist should still be visible

## Step 9: Test Nova Tools

In Studio SQL Editor, verify the tools are callable:

```sql
-- Test get_onboarding_status tool (called by Nova)
SELECT public.get_onboarding_status(NULL);

-- Should return onboarding status even if called with NULL (uses current user)
```

## Step 10: Backfill Historical Activity (Optional)

If you have existing activity_log data that you want to populate in analytics_events:

```sql
-- Backfill all activity_log entries from last 7 days
SELECT public.backfill_analytics_events(
  now() - interval '7 days',
  now()
);
```

Check the result:
```sql
SELECT COUNT(*) FROM public.analytics_events;
SELECT COUNT(*) FROM public.activity_log WHERE timestamp > now() - interval '7 days';
```

Numbers should be close (if trigger worked correctly for recent entries, analytics_events should equal or exceed activity_log count).

---

## Troubleshooting

### Trigger Doesn't Fire

**Symptom:** activity_log has rows, but analytics_events is empty.

**Check:**
1. Verify trigger exists:
   ```sql
   SELECT * FROM information_schema.triggers WHERE trigger_name = 'activity_log_to_analytics';
   ```

2. Check PostgreSQL function compilation:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'populate_analytics_event';
   ```

3. Check if trigger is disabled:
   ```sql
   ALTER TABLE activity_log ENABLE TRIGGER activity_log_to_analytics;
   ```

### RLS Blocks Queries

**Symptom:** You get a "row security policy" error when querying analytics_events.

**Fix:**
- Log in with a real JWT token (use the login UI, not anonymous)
- Or run as `service_role` (in studio, use the "service_role" selector at the top)

### Functions Not Found

**Symptom:** `ERROR: function get_onboarding_status does not exist`

**Check:**
```sql
\df public.get_onboarding_status
```

If empty, the migration didn't apply. Run `supabase db push` again.

---

## Success Criteria

- [x] All 4 tables created with correct schemas
- [x] All indexes created
- [x] All 6 functions deployed
- [x] All 3 triggers active
- [x] RLS enabled on all tables
- [x] Activity log trigger fires when new task created
- [x] Onboarding RPCs callable and return correct data
- [x] OnboardingChecklist component renders on Dashboard
- [x] Nova tools added to tool definitions

---

## Next: Release 2

Once testing passes locally, commit these changes:

```bash
git add -A
git commit -m "feat(adoption): Release 1 — analytics foundation, onboarding tables, Nova tools

- Add analytics_events table + trigger for event bus
- Add onboarding_state, onboarding_progress, user_achievements tables
- Add onboarding RPCs: mark_onboarding_step_complete, dismiss_onboarding, get_onboarding_status
- Add adoption-config.ts with role-aware onboarding steps, funnel stages, feature thresholds
- Add OnboardingChecklist.jsx dashboard widget
- Add 3 new Nova tools: get_my_work_summary, get_onboarding_status, get_department_health
- All tables have RLS enabled with proper permission policies

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Then start Release 2 (Adoption Analytics Dashboard, Nudges, Health Scoring).
